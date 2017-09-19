var tools = require("../tools/tools.js");
var jwt = require("../tools/jwt.js");
var express = require("express");
var router = express.Router();

var redis = require("redis");
var client = redis.createClient();

let schedule = require("node-schedule");
let request = require("request");

client.on("connect", () => {
  console.log("Redis_connected in callback.js");
});

/** /callback **/
router.get("/", function(req, res) {
  // Verify anti-forgery
  if (!tools.verifyAntiForgery(req.session, req.query.state)) {
    return res.send("Error - invalid anti-forgery CSRF response!");
  }

  // Exchange auth code for access token
  tools.intuitAuth.code.getToken(req.originalUrl).then(
    function(token) {
      // Store token - this would be where tokens would need to be
      // persisted (in a SQL DB, for example).
      tools.saveToken(req.session, token);

      //refresh token hourly
      let j = schedule.scheduleJob("* /2 * * * *", function() {
        console.log("Schedule refresh token are called");
        request("/api_call/refresh", function(error, response, body) {
          console.log("Hourly 39:" + response.statusCode);
        });
      });

      req.session.realmId = req.query.realmId;
      client.set("realmId", "123145629669197", function(err, reply) {
        console.log("callback.js: realmId saved to redis: " + reply);
      });
      var errorFn = function(e) {
        console.log("Invalid JWT token!");
        console.log(e);
        res.redirect("/");
      };

      if (token.data.id_token) {
        try {
          // We should decode and validate the ID token
          jwt.validate(
            token.data.id_token,
            function() {
              // Callback function - redirect to /connected
              res.redirect("connected");
            },
            errorFn
          );
        } catch (e) {
          errorFn(e);
        }
      } else {
        // Redirect to /connected
        res.redirect("connected");
      }
    },
    function(err) {
      console.log(err);
      res.send(err);
    }
  );
});

module.exports = router;
