var http = require('http');
var fs = require('fs');
var request = require('request');

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var server = http.createServer(app);

var tokens = new Array();
var users = {};

var Fitbit = require('fitbit-node');
var client = new Fitbit('227TSJ', '376d87a0686fbdb04e060a68c60db437');
var refreshResponse;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get('/', function(req,res) {
	sendHTML('index', res);
});

app.get('/authorise', function(req,res) {
	var authURL = client.getAuthorizeUrl("activity heartrate location nutrition profile settings sleep social weight", "http://localhost:8000/callback");
	res.redirect(authURL + "&prompt=login");
});

app.get('/callback', function(req,res) {

	client.getAccessToken(req.query.code, 'http://localhost:8000/callback').then(function (result) {
		console.log(result);

		fs.appendFile('accessTokens.json', JSON.stringify(result) + "\n", function(err) {
			if(!err) {
				console.log("Saved tokens.");
			} else {
				console.log(err);
			}
		});

		var accToken = result.access_token;
		var profile = client.get("/profile.json", accToken);
		var steps = client.get("/activities/tracker/steps/date/today/max.json", accToken);
		var heart = client.get("/activities/heart/date/today/1m.json", accToken);
		var sleep = client.get("/sleep/minutesAsleep/date/today/max.json", accToken);
		Promise.all([profile, steps, heart, sleep]).then(function(results) {
			//res.send(results[1][0]);

			var info = results[0][0];
			var daily_steps = results[1][0]['activities-tracker-steps'];
			var daily_heartrate = results[2][0]['activities-heart'];
			var daily_sleep = results[3][0]['sleep-minutesAsleep'];

			console.log(info);
			console.log(daily_steps);
			console.log(daily_heartrate);
			console.log(daily_sleep);

			var exists = false;
			for(var i = 0;i < users.ids.length; i++) {
				if(users.ids[i] == info.user.encodedId) {
					exists = true;
					break;
				}
			}

			if(!exists) {
				var profileData = {
					name: info.user.fullName,
					encodedId: info.user.encodedId,
					age: info.user.age,
					dateOfBirth: info.user.dateOfBirth,
					gender: info.user.gender,
					memberSince: info.user.memberSince,
					strideLengthWalking: info.user.strideLengthWalking
				}

				fs.truncate('streams/fitbit/profile.json', users.fileLength - 1, function(err) {
					if(!err) {
						fs.appendFile('streams/fitbit/profile.json', "," + JSON.stringify(profileData) + "]", function(err) {
							if(!err) {
								console.log("Saved profile data.");
								users.fileLength = (users.fileLength - 1) + (JSON.stringify(profileData).length + 2);
								users.ids.push(info.user.encodedId);
							} else {
								console.log(err);
							}
						});
					} else {
						console.log("Error with truncating file.")
					}
				})


				users.length++
				users.ids.push(info.user.encodedId);
			} else {
				console.log("Profile already exists.")
			}

			fs.readFile("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", 'utf8', function(err, data) {
				if(!err) {
					var body;
					try {
						body = JSON.parse(data);
					} catch(e){
						if(data.indexOf('}],') !== -1) {
							data = data.replace('}],', '},');
							body = JSON.parse(data);
						} else if(data.indexOf(']') == -1) {
							data = data + "]";
							body = JSON.parse(data);
						}
					}
					var stepslatestDate = body[0];

					for(var b = 1;b < body.length;b++) {
						if(body[b].dateTime >= stepslatestDate.dateTime) {
							stepslatestDate = body[b];
						}
					}

					var steps_toAppend = daily_steps.filter(function(obj) {
						if(obj.dateTime > stepslatestDate.dateTime) {
							return true;
						} else if(obj.dateTime == stepslatestDate.dateTime) {
							if(parseInt(obj.value) != stepslatestDate.value) {
								return true;
							}
						}
					});
					steps_toAppend.forEach(function(value, index, appendArray) {
						var steps_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: value.dateTime,
							value: parseInt(value.value)
						}
						appendArray[index] = steps_payload;
					});

					//console.log(JSON.stringify(steps_toAppend).substring(1));

					if(steps_toAppend.length > 0) {
						fs.truncate("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", data.length - 1, function(err) {
							if(!err) {
								fs.appendFile("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", "," + JSON.stringify(steps_toAppend).substring(1), "utf8", function(err) {
									if(!err) {
										console.log("Updated " + info.user.encodedId + "'s step data.");
									}
								});
							}
						})
					} else {
						console.log("Step data up to date.");
					}

				} else if(err.code == "ENOENT") {
					var steps_payloads = [];
					for(var s = 0; s < daily_steps.length; s++) {
						var steps_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: daily_steps[s].dateTime,
							value: parseInt(daily_steps[s].value)
						}
						steps_payloads.push(steps_payload);
					}
					fs.writeFile("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", JSON.stringify(steps_payloads), "utf8", function(err) {
						if(!err) {
							console.log("Created file for " + info.user.encodedId + " successfully.");
						}
					})
				} else {
					console.log(err.code);
				}
			});

			fs.readFile("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", 'utf8', function(err, data) {
				if(!err) {
					var body = JSON.parse(data);
					var heartratelatestDate = body[0];

					for(var b = 1;b < body.length;b++) {
						if(body[b].dateTime >= heartratelatestDate.dateTime) {
							heartratelatestDate = body[b];
						}
					}


					var heartrate_toAppend = daily_heartrate.filter(function(obj) {
						if(obj.dateTime > heartratelatestDate.dateTime) {
							return true;
						} else if(obj.dateTime == heartratelatestDate.dateTime) {
							if(parseInt(obj.value.restingHeartRate) !== heartratelatestDate.restingHeartRate) {
								return true;
							}
						}
					});
					heartrate_toAppend.forEach(function(value, index, appendArray) {
						var heartrate_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: value.dateTime,
							restingHeartRate: value.value.restingHeartRate ? value.value.restingHeartRate : 0
						}
						appendArray[index] = heartrate_payload;
					});

					//console.log(JSON.stringify(heartrate_toAppend).substring(1));

					if(heartrate_toAppend.length > 0) {
						fs.truncate("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", data.length - 1, function(err) {
							if(!err) {
								fs.appendFile("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", "," + JSON.stringify(heartrate_toAppend).substring(1), "utf8", function(err) {
									if(!err) {
										console.log("Updated " + info.user.encodedId + "'s heartrate data.");
									}
								});
							}
						})
					} else {
						console.log("Heartrate data up to date.");
					}

				} else if(err.code == "ENOENT") {
					var heartrate_payloads = [];
					for(var s = 0; s < daily_heartrate.length; s++) {
						var heartrate_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: daily_heartrate[s].dateTime,
							restingHeartRate: daily_heartrate[s].value.restingHeartRate ? daily_heartrate[s].value.restingHeartRate : 0
						}
						heartrate_payloads.push(heartrate_payload);
					}
					fs.writeFile("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", JSON.stringify(heartrate_payloads), "utf8", function(err) {
						if(!err) {
							console.log("Created file for " + info.user.encodedId + "'s heartrate successfully.");
						}
					})
				} else {
					console.log(err.code);
				}
			});

			fs.readFile("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", 'utf8', function(err, data) {
				if(!err) {
					var body = JSON.parse(data);
					var sleeplatestDate = body[0];

					for(var b = 1;b < body.length;b++) {
						if(body[b].dateTime >= sleeplatestDate.dateTime) {
							sleeplatestDate = body[b];
						}
					}


					var sleep_toAppend = daily_sleep.filter(function(obj) {
						if(obj.dateTime > sleeplatestDate.dateTime) {
							return true;
						} else if(obj.dateTime == sleeplatestDate.dateTime) {
							if(parseInt(obj.value) !== sleeplatestDate.minutesAsleep) {
								return true;
							}
						}
					});
					sleep_toAppend.forEach(function(value, index, appendArray) {
						var sleep_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: value.dateTime,
							minutesAsleep: parseInt(value.value)
						}
						appendArray[index] = sleep_payload;
					});

					//console.log(JSON.stringify(sleep_toAppend).substring(1));
					if(sleep_toAppend.length > 0) {
						fs.truncate("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", data.length - 1, function(err) {
							if(!err) {
								fs.appendFile("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", "," + JSON.stringify(sleep_toAppend).substring(1), "utf8", function(err) {
									if(!err) {
										console.log("Updated " + info.user.encodedId + "'s sleep data.");
									}
								});
							}
						});
					} else {
						console.log("Sleep data up to date.");
					}

				} else if(err.code == "ENOENT") {
					var sleep_payloads = [];
					for(var s = 0; s < daily_sleep.length; s++) {
						var sleep_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: daily_sleep[s].dateTime,
							minutesAsleep: parseInt(daily_sleep[s].value)
						}
						sleep_payloads.push(sleep_payload);
					}
					fs.writeFile("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", JSON.stringify(sleep_payloads), "utf8", function(err) {
						if(!err) {
							console.log("Created file for " + info.user.encodedId + "'s sleep' successfully.");
						}
					})
				} else {
					console.log(err.code);
				}
			});

			sendHTML('complete', res);
		});
	});
});

app.post('/update', function(req, res) {
	if(req.body) {
		var accToken = req.body.tokens.access_token;
		var profile = client.get("/profile.json", accToken);
		var steps = client.get("/activities/tracker/steps/date/today/max.json", accToken);
		var heart = client.get("/activities/heart/date/today/1m.json", accToken);
		var sleep = client.get("/sleep/minutesAsleep/date/today/max.json", accToken);
		Promise.all([profile, steps, heart, sleep]).then(function(results) {
			//res.send(results[1][0]);

			results.forEach(function(val, ind) {
				if(val[1].statusCode == 429) {
					res.sendStatus('429');
					return;
				}
			})

			var info = results[0][0];
			var daily_steps = results[1][0]['activities-tracker-steps'];
			var daily_heartrate = results[2][0]['activities-heart'];
			var daily_sleep = results[3][0]['sleep-minutesAsleep'];

			//console.log(info);
			//console.log(daily_steps);
			//console.log(daily_heartrate);
			//console.log(daily_sleep);

			var exists = false;
			for(var i = 0;i < users.ids.length; i++) {
				if(users.ids[i] == info.user.encodedId) {
					exists = true;
					break;
				}
			}

			if(!exists) {
				var profileData = {
					name: info.user.fullName,
					encodedId: info.user.encodedId,
					age: info.user.age,
					dateOfBirth: info.user.dateOfBirth,
					gender: info.user.gender,
					memberSince: info.user.memberSince,
					strideLengthWalking: info.user.strideLengthWalking
				}

				fs.truncate('streams/fitbit/profile.json', users.fileLength - 1, function(err) {
					if(!err) {
						fs.appendFile('streams/fitbit/profile.json', "," + JSON.stringify(profileData) + "]", function(err) {
							if(!err) {
								console.log("Saved profile data.");
								users.fileLength = (users.fileLength - 1) + (JSON.stringify(profileData).length + 2);
								users.ids.push(info.user.encodedId);
							} else {
								console.log(err);
							}
						});
					} else {
						console.log("Error with truncating file.")
					}
				})


				users.length++
				users.ids.push(info.user.encodedId);
			} else {
				console.log("Profile already exists.")
			}

			fs.readFile("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", 'utf8', function(err, data) {
				if(!err) {
					var body;
					try {
						body = JSON.parse(data);
					} catch(e){
						if(data.indexOf('}],') !== -1) {
							data = data.replace('}],', '},');
							body = JSON.parse(data);
						} else if(data.indexOf(']') == -1) {
							data = data + "]";
							body = JSON.parse(data);
						}
					}
					var stepslatestDate = body[0];

					for(var b = 1;b < body.length;b++) {
						if(body[b].dateTime >= stepslatestDate.dateTime) {
							stepslatestDate = body[b];
						}
					}

					var steps_toAppend = daily_steps.filter(function(obj) {
						if(obj.dateTime > stepslatestDate.dateTime) {
							return true;
						} else if(obj.dateTime == stepslatestDate.dateTime) {
							if(parseInt(obj.value) != stepslatestDate.value) {
								return true;
							}
						}
					});
					steps_toAppend.forEach(function(value, index, appendArray) {
						var steps_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: value.dateTime,
							value: parseInt(value.value)
						}
						appendArray[index] = steps_payload;
					});

					//console.log(JSON.stringify(steps_toAppend).substring(1));
					if(steps_toAppend.length > 0) {
						fs.truncate("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", data.length - 1, function(err) {
							if(!err) {
								fs.appendFile("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", "," + JSON.stringify(steps_toAppend).substring(1), "utf8", function(err) {
									if(!err) {
										console.log("Updated " + info.user.encodedId + "'s step data.");
									}
								});
							}
						})
					} else {
						console.log("Step data up to date for " + info.user.encodedId + ".");
					}

				} else if(err.code == "ENOENT") {
					var steps_payloads = [];
					for(var s = 0; s < daily_steps.length; s++) {
						var steps_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: daily_steps[s].dateTime,
							value: parseInt(daily_steps[s].value)
						}
						steps_payloads.push(steps_payload);
					}
					fs.writeFile("streams/fitbit/steps/" + info.user.encodedId + "_steps.json", JSON.stringify(steps_payloads), "utf8", function(err) {
						if(!err) {
							console.log("Created file for " + info.user.encodedId + " successfully.");
						}
					})
				} else {
					console.log(err.code);
				}
			});

			fs.readFile("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", 'utf8', function(err, data) {
				if(!err) {
					var body = JSON.parse(data);
					var heartratelatestDate = body[0];

					for(var b = 1;b < body.length;b++) {
						if(body[b].dateTime >= heartratelatestDate.dateTime) {
							heartratelatestDate = body[b];
						}
					}


					var heartrate_toAppend = daily_heartrate.filter(function(obj) {
						obj.value.restingHeartRate = obj.value.restingHeartRate ? obj.value.restingHeartRate : 0;
						if(obj.dateTime > heartratelatestDate.dateTime) {
							return true;
						} else if(obj.dateTime == heartratelatestDate.dateTime) {
							return parseInt(obj.value.restingHeartRate) !== heartratelatestDate.restingHeartRate;
						}
					});
					heartrate_toAppend.forEach(function(value, index, appendArray) {
						var heartrate_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: value.dateTime,
							restingHeartRate: value.value.restingHeartRate ? value.value.restingHeartRate : 0
						}
						appendArray[index] = heartrate_payload;
					});

					//console.log(JSON.stringify(heartrate_toAppend).substring(1));

					if(heartrate_toAppend.length > 0) {
						fs.truncate("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", data.length - 1, function(err) {
							if(!err) {
								fs.appendFile("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", "," + JSON.stringify(heartrate_toAppend).substring(1), "utf8", function(err) {
									if(!err) {
										console.log("Updated " + info.user.encodedId + "'s heartrate data.");
									}
								});
							}
						})
					} else {
						console.log("Heartrate data up to date for " + info.user.encodedId + ".");
					}

				} else if(err.code == "ENOENT") {
					var heartrate_payloads = [];
					for(var s = 0; s < daily_heartrate.length; s++) {
						var heartrate_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: daily_heartrate[s].dateTime,
							restingHeartRate: daily_heartrate[s].value.restingHeartRate ? daily_heartrate[s].value.restingHeartRate : 0
						}
						heartrate_payloads.push(heartrate_payload);
					}
					fs.writeFile("streams/fitbit/heartrate/" + info.user.encodedId + "_heartrate.json", JSON.stringify(heartrate_payloads), "utf8", function(err) {
						if(!err) {
							console.log("Created file for " + info.user.encodedId + "'s heartrate successfully.");
						}
					})
				} else {
					console.log(err.code);
				}
			});

			fs.readFile("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", 'utf8', function(err, data) {
				if(!err) {
					var body = JSON.parse(data);
					var sleeplatestDate = body[0];

					for(var b = 1;b < body.length;b++) {
						if(body[b].dateTime >= sleeplatestDate.dateTime) {
							sleeplatestDate = body[b];
						}
					}


					var sleep_toAppend = daily_sleep.filter(function(obj) {
						if(obj.dateTime > sleeplatestDate.dateTime) {
							return true;
						} else if(obj.dateTime == sleeplatestDate.dateTime) {
							if(parseInt(obj.value) !== sleeplatestDate.minutesAsleep) {
								return true;
							}
						}
					});
					sleep_toAppend.forEach(function(value, index, appendArray) {
						var sleep_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: value.dateTime,
							minutesAsleep: parseInt(value.value)
						}
						appendArray[index] = sleep_payload;
					});

					//console.log(JSON.stringify(sleep_toAppend).substring(1));
					if(sleep_toAppend.length > 0) {
						fs.truncate("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", data.length - 1, function(err) {
							if(!err) {
								fs.appendFile("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", "," + JSON.stringify(sleep_toAppend).substring(1), "utf8", function(err) {
									if(!err) {
										console.log("Updated " + info.user.encodedId + "'s sleep data.");
									}
								});
							}
						});
					} else {
						console.log("Sleep data up to date for " + info.user.encodedId + ".");
					}

				} else if(err.code == "ENOENT") {
					var sleep_payloads = [];
					for(var s = 0; s < daily_sleep.length; s++) {
						var sleep_payload = {
							name: info.user.fullName,
							encodedId: info.user.encodedId,
							dateTime: daily_sleep[s].dateTime,
							minutesAsleep: parseInt(daily_sleep[s].value)
						}
						sleep_payloads.push(sleep_payload);
					}
					fs.writeFile("streams/fitbit/sleep/" + info.user.encodedId + "_sleep.json", JSON.stringify(sleep_payloads), "utf8", function(err) {
						if(!err) {
							console.log("Created file for " + info.user.encodedId + "'s sleep' successfully.");
						}
					})
				} else {
					console.log(err.code);
				}
			});

			res.sendStatus(200);
		});
	} else {
		console.log("No access token supplied.")
		res.sendStatus(401);
	}
})

var sendHTML = function(fileName, response) {
	fs.readFile('views/' + fileName + '.html', function(err, body) {
		if(!err) {
			response.write(body);
			response.end();
		} else {
			console.log(err);
			response.send("Error");
		}
	});
}

var initData = function() {
	fs.readFile('streams/fitbit/profile.json', 'utf8', function(err, body) {
		users.fileLength = body.length;
		if(body.length > 0) {
			body = JSON.parse(body);
			users.length = body.length;
			users.ids = new Array();
			for(var id = 0; id < body.length; id++) {
				users.ids.push(body[id].encodedId);
			}

			fs.readFile('accessTokens.json', 'utf8', function(err, data) {
				data = data.split("\n");
				data.pop();

			});
		}
	});
}

var updateData = function() {
	fs.readFile('accessTokens.json', 'utf8', function(err, body) {
		body = body.split("\n");
		body.pop();
		body.reverse();
		var ids = new Array();

		for(var b = 0; b < body.length; b++) {
			body[b] = JSON.parse(body[b]);
			var exists = false;
			for(var id = 0; id < ids.length; id++) {
				if(body[b].user_id == ids[id].user_id) {
					exists = true;
					break;
				}
			}
			if(!exists) {
				ids.push(body[b]);
			}
		}

		fs.truncate('accessTokens.json', 0, function(err) {
			tokens = [];
			if(!err) {
				console.log("Truncated file.");
					var completedRequests = 0;
					ids.forEach(function(val, ind) {
						request({method:"POST", url:"https://api.fitbit.com/oauth2/token", form: {grant_type:"refresh_token", refresh_token:val.refresh_token}, headers: {Authorization: "Basic " + new Buffer("227TSJ:376d87a0686fbdb04e060a68c60db437").toString('base64') }})
							.on('response', function(response) {
								var body = '';
								response.on("data", function(data) {
									body+=data;
								});
								response.on('end', function() {
									console.log(body);
									body = JSON.parse(body);
									if(body.success != false) {
										tokens.push(body);
										fs.appendFile('accessTokens.json', JSON.stringify(body) + "\n", "utf8", function(err) {
											if(!err) {
												console.log("Updated access token for " + val.user_id);
												if(++completedRequests == ids.length) {
													tokens.forEach(function(val, index) {
														request({method: "POST", url:"http://localhost:8000/update", form:{tokens: tokens[index]}})
															.on('response', function(response) {
																if(response.statusCode == 200) {
																	console.log("Success.");
																} else if(response.statusCode == 429) {
																	console.log("Failed: Rate limit exceeded.");
																}
															}).on('error', function(err) {
																console.log('Error updating data.');
																console.log(err);
															});
													});
												}
											} else {
												console.log("Couldn't update file with access token: ");
												console.log(err);
											}
										});
									} else {
										console.log("Failed to update access token: ");
										console.log(body.errors[0]);
									}
								})
							}).on('error', function(err) {
								console.log("Error updating access tokens.");
								console.log(err);
							});
					});


			} else {
				console.log(err);
			}
		});
	});
}

//setInterval(updateData, 1.44e+7);

setInterval(updateData, 1200000);

server.listen(8000, function(req,res) {
	console.log('Connected...');
	initData();
	updateData();
	//getLatestStepData();
	//getLatestHeartData();
	//getLatestSleepData();
	console.log("Please go to http://localhost:8000/ to authorise this app if you haven't already.");
});
