var fs = require('fs');
var http = require('http');
var path = require('path');
var mime = require('mime');
var mongodb = require("mongodb");
var cookies = require("cookies");
var uuid = require("uuid");
var WebSocket = require("ws");
var queryString = require("query-string");

var mongo = mongodb.MongoClient;
var ObjectId = mongodb.ObjectId;

const config = { dbUrl: "mongodb://localhost:27017", dbName: "bank", accountsName: "accounts", transactionsName: "transactions" };
const debugLog = true; // turning on logging to the console
const listeningPort = 8888;

var accounts = null;
var transactions = null;
const exampleAccounts = [
	{
        "login" : "adam",
        "password" : "adam1",
        "balance" : 500,
        "limit" : -100,
        "role" : "user"
	},
	{
        "login" : "bob",
        "password" : "bob1",
        "balance" : 200,
        "limit" : 0,
		"role" : "user"
	},
	{
		"login" : "admin",
		"password" : "admin",
		"balance" : 0,
		"limit" : 0,
		"role" : "admin"
	}
];

var sessions = {};

mongo.connect(config.dbUrl, function(err, conn) {
	if(err) {
		console.log(err);
		process.exit(1);
	}
	var db = conn.db(config.dbName);
	accounts = db.collection(config.accountsName);
	transactions = db.collection(config.transactionsName);
	if(debugLog) console.log("Connected to "  + config.dbUrl + ", database " + config.dbName);
	accounts.find({}).count(function(err, n) {
		if(debugLog) console.log("Current number of accounts: " + n);
		if(n < 1) {
			if(debugLog) console.log("Example data initialization");
			accounts.insertMany(exampleAccounts);
			if(debugLog) console.log("accounts.insert(" + JSON.stringify(exampleAccounts) + ")");
		}
	});
});

function serveFile(rep, fileName, errorCode, message) {
	
	if(debugLog) console.log('Serving file ' + fileName + (message ? ' with message \'' + message + '\'': ''));
	
    fs.readFile(fileName, function(err, data) {
		if(err) {
            serveError(rep, 404, 'Document ' + fileName + ' not found');
        } else {
			rep.writeHead(errorCode, message, { 'Content-Type': mime.getType(path.basename(fileName)) });
			if(message) {
				data = data.toString().replace('{errMsg}', rep.statusMessage).replace('{errCode}', rep.statusCode);
			}
			rep.end(data);
        }
      });
}

function serveError(rep, error, message) {
	serveFile(rep, 'html/error.html', error, message);
}

var httpServer = http.createServer();
var wsServer = new WebSocket.Server({ server: httpServer });

httpServer.on('request', function (req, rep) {
	
	var cook = new cookies(req, rep);
	var session = cook.get('session');

	var now = new Date();
	if(!session || !sessions[session]) {
		session = uuid();
		sessions[session] = { created: now, touched: now };
		cook.set('session', session, { httpOnly: false });
		if(debugLog) console.log("Session " + session + " created");
	} else {
        sessions[session].touched = now;
	}

    if(debugLog) console.log('HTTP request from session ' + session + ' ' + req.method + ' ' + req.url);

    switch(req.url) {

		case '/':
		    console.log('xxx' + sessions[session].login)
		    serveFile(rep, 'html/index.html', 200, '');
		    break;

		case '/favicon.ico':
			serveFile(rep, 'img/favicon.ico', 200, '');
			break;

		case '/user':

			switch(req.method) {

				case 'GET':
					rep.writeHead(200,'ok',{"Content-type" : "application/json"});
					rep.write(JSON.stringify({ login: sessions[session] && sessions[session].login ? sessions[session].login : '' }));
					rep.end();
					break;

				case 'POST':
					var data = '';
					req.setEncoding('utf8');
					req.on('data', function(portion) {
							data  += portion;
					}).on('end',function() {
						var creds = null;
						try {
                            creds = JSON.parse(data);
                        } catch(ex) {
                            rep.writeHead(401, 'Auth failed', {"Content-type" : "application/json"});
                            rep.end(JSON.stringify({ err: 'Data corrupted' }));
						    return;
                        }
						accounts.findOne(creds, function(err, doc) {
							if(err || !doc) {
								if(debugLog) console.log('Login failed using ' + JSON.stringify(creds));
								rep.writeHead(401, 'Auth failed', {"Content-type" : "application/json"});
								rep.end(JSON.stringify({ err: 'Login failed' }));
							} else {
								sessions[session].login = creds.login;
								sessions[session].account = doc._id;

								if (debugLog) console.log('' + doc.role);
								sessions[session].role = doc.role;


								//todo
								if(debugLog) console.log(' ' + JSON.stringify(sessions[session]));
								rep.writeHead(200, 'OK', {"Content-type" : "application/json"});
								rep.end(JSON.stringify({ login: sessions[session] && sessions[session].login ? sessions[session].login : '' }));
							}
						});
					});
					break;

				case 'DELETE':
					delete sessions[session].login;
					delete sessions[session].account;
					rep.writeHead(200, 'OK', {"Content-type" : "application/json"});
					rep.end(JSON.stringify({ login: '' }));
					break;

				default:

                    rep.writeHead(405, 'Method not allowed', {"Content-type" : "application/json"});
                    rep.end(JSON.stringify({ err: 'Method not allowed' }));

			}
			break;

		case '/account':

			console.log(JSON.stringify(sessions));

			/**/if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
					rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
					rep.end(JSON.stringify({ err: 'Not logged in'}));
					break;
			}
			
			switch(req.method) {

				case 'GET':
				
					accounts.findOne({ _id: sessions[session].account }, function(err, doc) {
						rep.writeHead(200, 'OK', { "Content-type" : "application/json "});
						delete doc._id;
						delete doc.password;
						rep.end(JSON.stringify(doc));
					});
					break;

				case 'POST':
					var data = '';
					req.setEncoding('utf8');
					req.on('data', function (portion) {
							data  += portion;
					}).on('end', function() {
                        if(debugLog) console.log("Transfer: " + data);
                        var transfer = null;
                        try {
                            transfer = JSON.parse(data);
                        } catch(ex) {
                            rep.writeHead(406, 'Not acceptable', {"Content-type": "application/json"});
                            rep.end(JSON.stringify( {err: "Data corrupted" }));
                            return;
                        }
                        accounts.findOne({ _id: sessions[session].account }, function(err, doc) {

                            if(!transfer.recipient || transfer.recipient == sessions[session].login) {
                                rep.writeHead(406, 'Not acceptable', {"Content-type": "application/json"});
                                rep.end(JSON.stringify( {err: "Illegal recipient " + transfer.recipient }));
                                return;
                            }

                        	if(transfer.amount <= 0) {
                                rep.writeHead(406, 'Not acceptable', {"Content-type": "application/json"});
                                rep.end(JSON.stringify( {err: "Transfer amount should be positive" }));
                                return;
							}

                        	doc.balance -= transfer.amount;
						
							if(doc.balance < doc.limit) {
								rep.writeHead(406, 'Not acceptable', {"Content-type": "application/json"});
								rep.end(JSON.stringify( {err: "Limit exceeded" }));
								return;
							}

							accounts.findOne({ login: transfer.recipient }, function(err, docr) {
								if(err || !docr) {
                                    rep.writeHead(406, 'Not acceptable', {"Content-type": "application/json"});
                                    rep.end(JSON.stringify( {err: "No such recipient " + transfer.recipient + " found" }));
                                    return;
								}
                                accounts.findOneAndUpdate({ _id: sessions[session].account }, { $set: { balance: doc.balance }});
								 accounts.findOneAndUpdate({ login: transfer.recipient }, { $set: { balance: docr.balance + transfer.amount }});
                                transactions.insertOne({ account: doc._id, account2: docr._id, date: now, amount: -transfer.amount, after: doc.balance, title: transfer.title });
                                transactions.insertOne({ account: docr._id, account2: doc._id, date: now, amount: transfer.amount, after: docr.balance + transfer.amount, title: transfer.title });
                                unicast(session, transfer.recipient, "success", "New transfer from " + sessions[session].login + "\n ,title:" + transfer.title +  "\n has just arrived");
                                rep.writeHead(200,'OK',{"Content-type": "application/json"});
                                rep.end(JSON.stringify(doc));
							});
                        });
                    });
                    break;

				default:
                    rep.writeHead(405, 'Method not allowed', {"Content-type" : "application/json"});
                    rep.end(JSON.stringify({ err: 'Method not allowed' }));

			}
			break;

		case '/history':

			if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
				rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
				rep.end(JSON.stringify({ error: 'Not logged in'}));
				break;
			}

			transactions.find({ account: sessions[session].account }).count(function(err, n) {
				rep.writeHead(200,'OK',{"Content-type": "application/json"});
				rep.end(JSON.stringify({ length : n }));
			});

			break;

		case '/recipients':

			if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
				rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
				rep.end(JSON.stringify({ error: 'Not logged in'}));
				break;
			}

			transactions.aggregate([
				{$match: {account2: sessions[session].account }},
				{$lookup: { from: "accounts", localField: "account", foreignField: "_id", as: "account" }},
				{$unwind: { path: "$account" }},
				{$addFields: {account2: "$account.login"}},
				{$project: { account2: 1, _id: 0}}
			]).toArray(function (err, docs) {
				rep.writeHead(200,'OK',{"Content-type": "application/json"});
				var result = unique(docs);
				rep.end(JSON.stringify(result));
			});

			break;

		case '/newAccount':
            if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
                rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
                rep.end(JSON.stringify({ error: 'Not logged in'}));
                break;
            }

            var data = ''

            req.setEncoding('utf8');
            req.on('data', function (portion) {
                data  += portion;
            }).on('end', function() {
                var newUser = null;
                try {
                    // newUser._id = new ObjectId();
                    newUser = JSON.parse(data);
                } catch(ex) {
                    rep.writeHead(406, 'Not acceptable', {"Content-type": "application/json"});
                    rep.end(JSON.stringify( {err: "Data corrupted" }));
                    return;
                }

                var newUserLogin = newUser.login

                accounts.findOne({login: newUserLogin}, function(err, doc) {
                    if (!doc) {
                        accounts.insertOne(newUser)
                        rep.writeHead(200,'OK',{"Content-type": "application/json"});
                        rep.end(JSON.stringify( {code: 'created'} ));
                        console.log("New user added.")
                    } else {
                        rep.writeHead(200, 'Not found', {"Content-type": "application/json"});
                        rep.end(JSON.stringify( {code: 'notCreated' }));
                        console.log("User with this login exist.")
                    }
                })
            })

            break;

        case '/allusers':
            if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
                rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
                rep.end(JSON.stringify({ error: 'Not logged in'}));
                break;
            }

            accounts.find({}, {login: 1, password: 1, role: 1, }).toArray(function (err, result) {
                if (err) {
                    rep.writeHead(500, 'Server error.', { "Content-type" : "application/json" });
                    rep.end(JSON.stringify({ error: 'Not logged in'}));
                    return;
                }

                if (result) {
                    rep.writeHead(200, 'OK', { "Content-type" : "application/json" });
                    rep.end(JSON.stringify(result))
                    console.log(result)
                }

            })
            break;

        case '/editUser':
            if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
                rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
                rep.end(JSON.stringify({ error: 'Not logged in'}));
                break;
            }



            var data = ''
            req.setEncoding('utf8');
            req.on('data', function (portion) {
                data  += portion;
            }).on('end', function() {
                var toUpdate = null
                try {
                    toUpdate = JSON.parse(data);
                } catch(ex) {
                    rep.writeHead(401, 'Auth failed', {"Content-type" : "application/json"});
                    rep.end(JSON.stringify({ err: 'Data corrupted' }));
                    return;
                }


                accounts.findOneAndUpdate( { login: toUpdate.login },
                    { $set:
                        {
                            balance: toUpdate.balance,
                            limit: toUpdate.limit,
                            role: toUpdate.role,
                            password: toUpdate.password
                        }
                    },
                function (err, doc) {
                    if (err) {
                        rep.writeHead(500, 'Failed', { "Content-type" : "application/json" });
                        rep.end(JSON.stringify({ error: 'Failed'}));
                    }

                    if (doc) {
                        debugger;
                        rep.writeHead(200,'OK',{"Content-type": "application/json"});
                        rep.end(JSON.stringify({code : 'success'}));
                    }
                })
            });

            break;

		default:

			if(/^\/history?/.test(req.url)) {

                if(!session || !sessions[session] || !sessions[session].login || !sessions[session].account) {
                    rep.writeHead(401, 'Auth required', { "Content-type" : "application/json" });
                    rep.end(JSON.stringify({ error: 'Not logged in'}));
                    break;
                }

				var p = queryString.parseUrl(req.url);
				console.log(JSON.stringify(p));
				
				var nSkip = parseInt(p.query.skip); if(isNaN(nSkip)) nSkip = 0;
				var nLimit = parseInt(p.query.limit); if(isNaN(nLimit)) nLimit = 999999;
				var nFrom = new Date(parseInt(p.query.from)); if(isNaN(nFrom.getTime())) nFrom = new Date(0);
				var nTo = new Date(parseInt(p.query.to)); if(isNaN(nTo.getTime())) nTo = new Date();
				
				var dataForm = p.query.data; if(!dataForm) dataForm = 'normal';
				if(dataForm == 'length') {
					nSkip = 0;
					nLimit = 999999;
				}
				
				var aggr = transactions.aggregate([
                    {$match: {account: sessions[session].account }},
					{$match: {date: {$gte: nFrom, $lt: nTo}}},
                    {$sort: {date: -1}},
                    {$skip: nSkip},
                    {$limit: nLimit},
				    {$lookup: { from: "accounts", localField: "account2", foreignField: "_id", as: "account2" }},
                    {$unwind: { path: "$account2" }},
                    {$addFields: {account2: "$account2.login"}}
				])
				
				if(dataForm == 'length') {
					aggr.toArray(function(err, docs) {
						rep.writeHead(200,'OK',{"Content-type": "application/json"});
						rep.end(JSON.stringify({length: docs.length}));
					});
				} else {
			
					aggr.toArray(function(err, docs) {
						rep.writeHead(200,'OK',{"Content-type": "application/json"});
						rep.end(JSON.stringify(docs));
					});
				}

			} else if(/^\/(html|css|js|fonts|img)\//.test(req.url)) {
                var fileName = path.normalize('./' + req.url)
                serveFile(rep, fileName, 200, '');

			} else {	
				serveError(rep, 403, 'Access denied');
			}
		}
	}
).listen(listeningPort);

wsServer.on('connection', function connection(conn) {

    if(debugLog) console.log('WebSocket connection initialized');

    conn.on('message', function(message) {

        var rep = { status: 'ok' };
        try {

            var msg = JSON.parse(message);
            if(debugLog) console.log('Frontend sent by ws: ' + JSON.stringify(msg));

            if(msg.session && !conn.session) {
                conn.session = msg.session;
                if(debugLog) console.log('WebSocket session set to ' + conn.session);
            }
        } catch(err) {
            rep.status = err;
        }
        conn.send(JSON.stringify(rep));
        if(debugLog) console.log('My answer sent by ws: ' + JSON.stringify(rep));

    }).on('error', function(err) {});
});

function broadcast(session, type, msg) {
    if(debugLog) console.log('Broadcasting: ' + session + ' -> ' + msg);
    wsServer.clients.forEach(function(client) {
        if(client.readyState === WebSocket.OPEN && client.session != session) {
            if(debugLog) console.log("Sending an event message to client " + client.session + " with data " + msg);
            client.send(JSON.stringify({ type: type, message: msg }));
        }
    });
}

function unicast(session, to, type, msg) {
    for(var sessionTo in sessions) {
        if(sessions.hasOwnProperty(sessionTo) && to == sessions[sessionTo].login) {
            wsServer.clients.forEach(function(client) {
                if(client.readyState === WebSocket.OPEN && client.session != session) {
                    if(debugLog) console.log("Sending an event message to client " + client.session + " with data " + msg);
                    client.send(JSON.stringify({ type: type, message: msg }));
                }
            });
        }
    }
}

function unique(array) {
    var result = [];
    for (var i = 0; i < array.length; i++) {
        var element = array[i].account2;
        if (!contains(result, element)) {
            result.push(element);
        }
    }
    return result;
}

function contains(array, s) {
    for (var j = 0; j < array.length; j ++) {
        if (s === array[j]) {
            return true;
        }
    }
    return false;
}

if(debugLog) console.log('Listening on port ' + listeningPort);