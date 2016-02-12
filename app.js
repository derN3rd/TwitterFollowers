var Twitter = require('twitter');
const low = require('lowdb');
const storage = require('lowdb/file-async');
var schedule = require('node-schedule');
var TeleBot = require('telebot');

var settings = {
  setupcomplete: false, //DO NOT CHANGE UNTIL YOU RAN app.js THE FIRST TIME
  notitype: 1, //see sendNotification() to see which type you want to use
  debug: false,
  twitter: {
    consumer_key: '',
    consumer_secret: '',
    access_token_key: '',
    access_token_secret: ''
  },
  me: 0, //own twitter id, get it on the apps.twitter.com page or google twitterid
  telegram: {
    token: '',
    chatid: 0
  }
}

var client = new Twitter({
  consumer_key: settings.twitter.consumer_key,
  consumer_secret: settings.twitter.consumer_secret,
  access_token_key: settings.twitter.access_token_key,
  access_token_secret: settings.twitter.access_token_secret
});

var telebot;
if(settings.telegram.token != ''){
  telebot = new TeleBot({
    token: settings.telegram.token,
    sleep: 120000, // How often check updates (in ms) 
    timeout: 0, // Update pulling timeout (0 - short polling) 
    limit: 100, // Limits the number of updates to be retrieved 
    retryTimeout: 5000 // Reconnecting timeout (in ms) 
  });
}

Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

const db = low('followers.json', { storage });

if ((settings.twitter.consumer_key=='') || (settings.twitter.consumer_secret=='') || (settings.twitter.access_token_key=='') || (settings.twitter.access_token_secret=='') || (settings.me==0)){
  console.log("Please check your config first.");
  process.exit(1);
}

var j = schedule.scheduleJob('0 */2 * * * *', function(){
	client.get('followers/ids', function(error, follower, response){
    if(settings.debug){
      if (error) throw error;
    }else{
      if (error) {
        console.log("Error while lookup all current followers: ");
        console.log(error);
      }
    }
    var users = follower.ids;
    var usersLength = users.length;
    if (settings.setupcomplete != true){
      if (db('currentfollowers').size() > 0){
        console.log("Follower db is not empty. Did you already had the first run and forgot to set settings.setupcomplete to true?");
        process.exit(1);  
      }
      //db not filled. do the first fill
      for (var i=0; i < usersLength; i++) {
        db('currentfollowers').push({id:users[i]});
      }
      console.log("First run complete, now set settings.setupcomplete to true and run me again!");
      process.exit(1);
    }else{
      //db is filled. get all ids and show diff from current twitter ids
      var currentfollowers = db('currentfollowers').map('id');

      var newfollowers = users.diff(currentfollowers);
      var newfollowersLength = newfollowers.length;
      //add users.diff(currentfollowers) to db
      if(newfollowersLength > 0){
        //join all userids so twitter can handle alllll this ids
        var queryjoined = newfollowers.join();
        client.post('users/lookup', {user_id:queryjoined}, function(error, userdata, response){
          //I know, if some user is deactivating their account, twitter will return n-1 users, so maybe you should check if all your queried ids are in the response. Maybe could do this with map('id') or something. TODO
          if(settings.debug){
            if (error) throw error;
          }else{
            if (error) {
              console.log("Error while lookup new followers: ");
              console.log(error);
            }
          }
          if (settings.debug) console.log(userdata); //debug
          var userdataLength = userdata.length;
          for (var i=0; i < userdataLength; i++) {
            //add id to current follower db, so the next time it wont get reported as new again
            db('currentfollowers').push({id:userdata[i].id});
            console.log("New Follower: "+userdata[i].id+" (@"+userdata[i].screen_name+" folgt "+userdata[i].friends_count+" und hat "+userdata[i].followers_count+" Follower)");
            //add to log db
            db('actions').push({user:userdata[i].id, name:userdata[i].screen_name, action:1, time:Date.now()});
            sendNotification("New Follower: "+userdata[i].id+" (@"+userdata[i].screen_name+" folgt "+userdata[i].friends_count+" und hat "+userdata[i].followers_count+" Follower) https://twitter.com/"+userdata[i].screen_name, settings.notitype);
          }
        });
      }
      
      

      var newunfollowers = currentfollowers.diff(users);
      var newunfollowersLength = newunfollowers.length;
      //remove currentfollowers.diff(users); from db
      if(newunfollowersLength > 0){
        //join all userids so twitter can handle alllll this ids
        var queryjoined = newunfollowers.join();
        client.post('users/lookup', {user_id:queryjoined}, function(error, userdata, response){
          if(settings.debug){
            if (error) throw error;
          }else{
            if (error) {
              console.log("Error while lookup unfollowers: ");
              console.log(error);
            }
          }
          if (settings.debug) console.log(userdata); //debug
          var userdataLength = userdata.length;
          for (var i=0; i < userdataLength; i++) {
            //remove id from current follower db, so the next time it wont get reported as new again
            db('currentfollowers').remove({id:userdata[i].id});
            console.log("New Unfollower: "+userdata[i].id+" (@"+userdata[i].screen_name+")");
            //add to log db
            db('actions').push({user:userdata[i].id, name:userdata[i].screen_name, action:0, time:Date.now()});
            sendNotification("New Unfollower: "+userdata[i].id+" (@"+userdata[i].screen_name+") https://twitter.com/"+userdata[i].screen_name, settings.notitype);
          }
        });
      }
    }
  });

});



function sendNotification(text, type){
  var types = {
    twitterdm: 1,
    telegram: 2,
    whatsapp: 4,
    twitter: 8
  }  
  if((type & types.twitterdm) == types.twitterdm){
    //send twitter dm
    console.log("Sending twitter dm");
    client.post('direct_messages/new', {user_id:settings.me, text:text}, function(error, body, response){
      if(settings.debug){
        if (error) throw error;
      }else{
        if (error) console.log("Error while sending dm notification: "+error);
      }
    });
  }
  if((type & types.telegram) == types.telegram){
    //send telegram message
    console.log("Sending telegram message");
    telebot.sendMessage(settings.telegram.chatid, text, {});
  }
  if((type & types.whatsapp) == types.whatsapp){
    //send whatsapp message
    console.log("Whatsapp likes to sue users who user the ChatApi or WhatsApp API, so you have to add it yourself");
  }
  if((type & types.twitter) == types.twitter){
    //send tweet
    //console.log("Sending tweet");
    //TO BE CONTINUED
  }
}