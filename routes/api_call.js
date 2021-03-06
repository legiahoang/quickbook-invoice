var tools = require('../tools/tools.js');
var config = require('../config.json');
var request = require('request');
var express = require('express');
var router = express.Router();
let redis = require('redis');
let client = redis.createClient();
client.on('connect', () => {
  console.log('Redis connected in api_call.js ');
});
/** /api_call **/
router.get('/', function(req, res) {
  let accessToken, realmId;
  let customerId;
  client.get('accessToken', (err, reply) => {
    accessToken = reply;
    client.get('realmId', (err, reply) => {
      realmId = reply;
      if (!accessToken) return res.json({ error: 'Not authorized' });
      if (!realmId)
        return res.json({
          error:
            'No realm ID.  QBO calls only work if the accounting scope was passed!'
        });

      // Set up API call (with OAuth2 accessToken)
      let url = config.api_uri + realmId + '/query?query=select * from Invoice';

      console.log('req.query.id value: ' + req.query.id);
      if (
        typeof req.query.id !== 'undefined' &&
        /^[0-9]+$/.test(req.query.id)
      ) {
        customerId = req.query.id;
        console.log('customerId value:' + customerId);
      }

      if (
        typeof req.query.id !== 'undefined' &&
        req.query.id.toString() === 'all'
      ) {
        customerId = 'all';
      }

      console.log('Making API call to: ' + url);
      var requestObj = {
        url: url,
        headers: {
          Authorization: 'Bearer ' + accessToken,
          Accept: 'application/json'
        }
      };

      // Make API call
      request(requestObj, function(err, response) {
        // Check if 401 response was returned - refresh tokens if so!
        tools.checkForUnauthorized(req, requestObj, err, response).then(
          function({ err, response }) {
            if (err || response.statusCode != 200) {
              return res.json({ error: err, statusCode: response.statusCode });
            }
            //Filter data before sent in back to client
            let body = JSON.parse(response.body);
            // let Invoices = body.QueryResponse.Invoice;
            // let filterInvoices = Invoices.filter(object=>{
            //   if(typeof object.CustomerRef.value === "undefined"){
            //     return false;
            //   }
            //   if(typeof customerId !== "undefined") {
            //     return object.CustomerRef.value.toString() === customerId.toString();
            //   }
            //   return true;
            // });
            //way 2:
            body.QueryResponse.Invoice = body.QueryResponse.Invoice.filter(
              object => {
                if (typeof object.CustomerRef.value === 'undefined') {
                  return false;
                }
                let b = customerId;
                if (typeof customerId !== 'undefined') {
                  if (customerId.toString() == 'all' && object.Balance > 0) {
                    return true;
                  }
                  return (
                    object.CustomerRef.value.toString() ===
                    customerId.toString()
                  );
                }
              }
            );

            // API Call was a success!
            res.json(body);
          },
          function(err) {
            console.log(err);
            return res.json(err);
          }
        );
      });
    });
  });
});

/** /api_call/revoke **/
router.get('/revoke', function(req, res) {
  var token = tools.getToken(req.session);
  if (!token) return res.json({ error: 'Not authorized' });

  var url = tools.revoke_uri;
  request(
    {
      url: url,
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + tools.basicAuth,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: token.accessToken
      })
    },
    function(err, response, body) {
      if (err || response.statusCode != 200) {
        return res.json({ error: err, statusCode: response.statusCode });
      }
      tools.clearToken(req.session);
      res.json({ response: 'Revoke successful' });
    }
  );
});

/** /api_call/refresh **/
// Note: typical use case would be to refresh the tokens internally (not an API call)
// We recommend refreshing upon receiving a 401 Unauthorized response from Intuit.
// A working example of this can be seen above: `/api_call`
router.get('/refresh', function(req, res) {
  let accessToken;
  client.get('accessToken', (err, reply) => {
    accessToken = reply;
    if (!accessToken) return res.json({ error: 'Not authorized' });
  });

  let accessTokenFake, refreshToken, tokenType, data;
  client.get('accessToken', (err, reply) => {
    accessTokenFake = reply;
    client.get('refreshToken', (err, reply) => {
      refreshToken = reply;
      client.get('tokenType', (err, reply) => {
        tokenType = reply;
        client.get('data', (err, reply) => {
          data = reply;

          let fakeToken = {
            accessToken: accessTokenFake,
            refreshToken: refreshToken,
            tokenType: tokenType,
            data: data
          };
          tools.refreshTokens(fakeToken).then(
            function(newToken) {
              // We have new tokens!
              res.json({
                accessToken: newToken.accessToken,
                refreshToken: newToken.refreshToken
              });
            },
            function(err) {
              // Did we try to call refresh on an old token?
              console.log(err);
              res.json(err);
            }
          );
        });
      });
    });
  });
});

module.exports = router;
