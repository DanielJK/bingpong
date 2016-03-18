// Source Code for Bing Pong (www.bing-pong.com)
// Created By Brian Kieffer on 3/24/2013
// Current version: 0.21.1-28 (3/18/2016)

// constants
var MS_REQUIRED_TO_SHOW_DOWNLOAD_STATUS = 500;
var MAX_NUMBER_OF_LOGOUT_ATTEMPTS = 10;
var MAX_NUMBER_OF_LOGIN_ATTEMPTS = 3;
var MAX_NUMBER_OF_SEARCH_ATTEMPTS = 5;
var MAX_NUMBER_OF_TASK_ATTEMPTS = 5;
var SAVE_SETTINGS_TIMEOUT = 10;
var BAD_LOGIN_WARNING_TIMEOUT = 15;
var GOOD_LOGIN_MESSAGE_TIMEOUT = 4000;
var COMMUNICATION_FAILURE_DELAY = 500;
var CAPTCHA_MESSAGE_TIMEOUT = 1;
var REDIRECTION_SERVICE = "http://www.nullrefer.com/?";

// multiple account variables
var dashboardData;
var accountsDone = 0;
var accountsToRun = 0;
var currentAccountIndex = 0;
var currentAccount;
var numberOfSearchesPerCredit = 2;
var creditsToGet;
var dashboardTaskAttemptCount = 0;
var searchAttemptCount = 0;
var dashboardTaskURLs = new Array();
var newCredits = 0;
var initialIP = 0;
var sectionToDisplay = 1;

// ...?
var statusTimeout;
var dictionary = new Array();
var useThisDictionary;
var regularSearchesToPerform = 35;
var mobileSearchesToPerform = 20;
var redirectionServiceRequired = 1;
var previousButtonText;
var requestDownloadUpdates;
var minSearchDelayTime;
var maxSearchDelayTime;
var numberOfDesktopSearches = 35;
var numberOfMobileSearches = 20;
var stopRunningBingPongFlag = false; // for pausing/stopping

checkBrowserCompatibility(function () {
	// currently do nothing
});

function checkBrowserCompatibility(callback) {
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Checking browser compatibility...", "DO_NOT_CHANGE", "DO_NOT_CHANGE");

	// it seems like Chrome is the only browser that can properly strip the referrer header with <meta name="referrer" content="never">
	// as a result, searches on any other browser will be sent through REDIRECT_SERVICE before they get sent to Bing
	if (chrome && chrome.runtime) {
		redirectionServiceRequired = 0;

		// enable the BPH options button
		// if BPH is not installed, this will be an install button
		document.getElementById('bphOptionsButton').disabled = false;

		// check for BPH
		bp.helperTools.updateHelperInstallationStatus(function (bphIsInstalled) { 
			if (bphIsInstalled) { 
				var installedHelperVersion = bp.helperTools.getInstalledHelperVersion();
				var latestHelperVersion = bp.helperTools.getLatestHelperVersion();

					if (!bp.helperTools.isUsingCompatibleHelperVersion()) {
						bp.status.change("Please update Bing Pong Helper.", "Version installed: " + installedHelperVersion, "Latest version: " + latestHelperVersion);
					}

					window.onunload = function () {
						bp.helperTools.disableMobileMode(function () {
							// do nothing else
						});
					};
			} else { // BPH is not installed, but Chrome is being used
				// change the BPH options button into an install button
				document.getElementById('bphOptionsButton').value = "Install Bing Pong Helper";
				document.getElementById('bphOptionsButton').onclick = function () {
					chrome.webstore.install(bphInstallURL, function () { // successful install
						// refresh the page
						setTimeout(function () {
							location.reload();
						}, 5000);
					}, function (details) { // install failed
						// do nothing at this time
					});
				};
			}

			if (!bp.helperTools.getHelperInstallionStatus() || bp.helperTools.isUsingCompatibleHelperVersion()) {
				bp.licensing.updateLicenseStatus(function (isLicensed) {
					// remove ads for licensed users
					bp.cookies.set("removeAd", isLicensed);
					
					if (isLicensed) {
						try {
							document.getElementById('ad').style.display = "none";
						} catch (e) {};
					}
					
					bp.settings.init(function () {
						if (!document.getElementById('runOnPageLoadOption').checked) {
							bp.settings.enable();
							bp.status.reset();
						}

						callback();
					});
				});
			}
		});
	} else {
		bp.settings.init(function () {
			bp.settings.enable();
			bp.status.reset();
			callback();
		});
	}
}

function onGlobalCheckmarkChange() {
	bp.cookies.set("globalCheck", document.getElementById('globalCheckmark').checked);

	for (var i = 1; bp.cookies.get("check" + i); i++) {
		if (i > 5 && !bp.licensing.getLicenseStatus()) {
			break;
		}

		bp.cookies.set("check" + i, document.getElementById('globalCheckmark').checked);
	}

	updateAccountManagerDisplay();
}

function onAccountCheckmarksChange() {
	// delete the old checkmark cookies
	bp.cookies.remove("globalCheck");

	for (var i = 1; bp.cookies.get("check" + i); i++) {
		bp.cookies.remove("check" + i);
	}

	// set the checkmark cookies
	for (var i = 1; i <= accountCount; i++) {
		bp.cookies.set("check" + i, document.getElementById('check' + i).checked);
	}

	// set the global checkmark cookie
	var globalCheckmarkValue = true;

	for (var i = 1; bp.cookies.get("check" + i); i++) {
		// only consider the first five accounts when there is no license
		if (i > 5 && !bp.licensing.getLicenseStatus()) {
			break;
		}

		if (!bp.cookies.get("check" + i) || bp.cookies.get("check" + i) === "false") {
			globalCheckmarkValue = false;
			break;
		}
	}

	bp.cookies.set("globalCheck", globalCheckmarkValue);

	// update the account manager display
	updateAccountManagerDisplay();
}

function stopRunningBingPong() {
	stopRunningBingPongFlag = true;
	document.getElementById('runBingPongButton').disabled = true;
	document.getElementById('runBingPongButton').value = "Stopping Bing Pong...";
	document.getElementById('runBingPongButton').onclick = runBingPong;
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Waiting for the current operation to finish...", "&nbsp;", "&nbsp;");
}


function performThisStep(stepNumber) {
	if (stopRunningBingPongFlag) {
		finishRunningBingPong();
	} else {
		if (stepNumber == 0) { // log-out step
			accountsDone++;

			// update the account manager display ONLY when initializing the first account
			if (document.getElementById('multipleAccountsOption').checked && accountsDone == 1) {
				updateAccountManagerDisplay();
			}

			if (document.getElementById('runInRandomOrderOption').checked) {
				// pick a random account from the list
				currentAccountIndex = Math.round(Math.random() * (usernamesLeftToRun.length - 1));

				// get the username and password corresponding to this index
				username = usernamesLeftToRun[currentAccountIndex];
				password = passwordsLeftToRun[currentAccountIndex];

				// remove the account from the accounts left to run
				usernamesLeftToRun.splice(currentAccountIndex, 1);
				passwordsLeftToRun.splice(currentAccountIndex, 1);

				// so that we can change the status of this account, set currentAccountIndex to be the index of the account in accountUsernames
				currentAccountIndex = accountUsernames.indexOf(username);
			} else { // otherwise, pick the first account and run it
				currentAccountIndex = 0;
				username = usernamesLeftToRun[currentAccountIndex];
				password = passwordsLeftToRun[currentAccountIndex];

				// remove the account from the accounts left to run
				usernamesLeftToRun.splice(currentAccountIndex, 1);
				passwordsLeftToRun.splice(currentAccountIndex, 1);

				// so that we can change the status of this account, set currentAccountIndex to be the index of the account in accountUsernames
				currentAccountIndex = accountUsernames.indexOf(username);
			}

			document.getElementById('status' + currentAccountIndex).innerHTML = "<img src=\"loader.gif\" width=\"10\" height=\"10\"></img>";
			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Signing in as " + username + "...", "&nbsp;", "&nbsp;");

			logoutOfAccount(function () {
				performThisStep(1);
			});
		} else if (stepNumber == 1) { // log-in step
			// bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Signing in as " + username + "...", "&nbsp;", "&nbsp;");

			logIntoAccount(username, password, function () { // log-in successful
				performThisStep(2);
			}, function () { // maximum number of log-in attempts exceeded
				document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				// document.getElementById('status_tq' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('credits' + currentAccountIndex).style.color = "#FF0000";
				document.getElementById('accountName' + currentAccountIndex).style.color = "#FF0000";
				document.getElementById('credits' + currentAccountIndex).style.color = "#FF0000";
				document.getElementById('credits' + currentAccountIndex).innerHTML = "BAD INFO?";

				performThisStep(9);
			}, function () { // account is blocked
				document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				// document.getElementById('status_tq' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('credits' + currentAccountIndex).style.color = "#FFFF00";
				document.getElementById('accountName' + currentAccountIndex).style.color = "#FFFF00";
				document.getElementById('credits' + currentAccountIndex).style.color = "#FFFF00";
				document.getElementById('credits' + currentAccountIndex).innerHTML = "BLOCKED";

				performThisStep(9);
			}, function () { // account is banned
				document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				// document.getElementById('status_tq' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
				document.getElementById('credits' + currentAccountIndex).style.color = "#FF0000";
				document.getElementById('accountName' + currentAccountIndex).style.color = "#FF0000";
				document.getElementById('credits' + currentAccountIndex).style.color = "#FF0000";
				document.getElementById('credits' + currentAccountIndex).innerHTML = "BANNED!!!";

				performThisStep(9);
			}, function () { // account needs a CAPTCHA to continue
				// GA tracking
				ga('send', 'event', 'Bing Pong', 'Statistics', 'Dashboard CAPTCHA');

				if (document.getElementById('pauseOnCaptchaOption').checked) {
					bp.status.changeWithTimeout("A CAPTCHA has been detected on the dashboard.", "To solve it, you will be taken there in %d second(s).", "&nbsp;", CAPTCHA_MESSAGE_TIMEOUT, function () {
						bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Opening the CAPTCHA...", "&nbsp;", "&nbsp;");
						bp.helperTools.openDashboardForCaptcha(function () {
							bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Waiting for the CAPTCHA to be solved...", "Click <a href=\"#\" onclick=\"openDashboardForCaptcha(function(){console.log('');});return false;\">HERE</a> to manually open it again.", "This message will disappear once you have solved the CAPTCHA.");
							var captchaInterval = setInterval(function () {
								getDashboardContents(function () {
									if (dashboardData.indexOf("verify your account") == -1) {
										closeDashboardForCaptcha(function () {
											performThisStep(2);
											clearInterval(captchaInterval);
										});
									}
								});
							}, 3000);
						});
					});
				} else {
					document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-expeditedssl\"></i>";
					document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-expeditedssl\"></i>";
					// document.getElementById('status_tq' + currentAccountIndex).innerHTML = "<i class=\"fa fa-expeditedssl\"></i>";
					document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-expeditedssl\"></i>";
					document.getElementById('credits' + currentAccountIndex).style.color = "#FFFF00";
					document.getElementById('accountName' + currentAccountIndex).style.color = "#FFFF00";
					document.getElementById('credits' + currentAccountIndex).style.color = "#FFFF00";
					document.getElementById('credits' + currentAccountIndex).innerHTML = "CAPTCHA";

					performThisStep(9);
				}
			});
		} else if (stepNumber == 2) { // get the dashboard and parse it for credit count, number of searches to do, ...
			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Fetching the Bing Rewards dashboard...", "&nbsp;", "&nbsp;");

			parseDashboardContents(function () {
				// reset the dictionary
				dictionary = null;

				// check for missing searches or dashboard tasks and respond accordingly
				getSearchCreditCount(false, true, function (desktopSearchesAreComplete, numberOfDesktopCreditsObtained) {
					getSearchCreditCount(true, true, function (mobileSearchesAreComplete, numberOfMobileCreditsObtained) {
						getNumberOfMissingDashboardTasks(false, true, function (numberOfTasksIncomplete) {
							// update the account manager display if necessary
							if (document.getElementById('multipleAccountsOption').checked) {
								if (desktopSearchesAreComplete) {
									document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-check\"></i>";
								}

								if (mobileSearchesAreComplete) {
									document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-check\"></i>";
								}

								if (!(numberOfTasksIncomplete > 0)) {
									document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-check\"></i>";
								}
							}

							// proceed to the next incomplete item
							if (!desktopSearchesAreComplete) {
								performThisStep(4);
							} else if (!mobileSearchesAreComplete) {
								performThisStep(5);
							} else if (numberOfTasksIncomplete > 0 && document.getElementById('dashboardTasksOption').checked) {
								performThisStep(7);
							} else { // everything is done
								performThisStep(9);
							}
						});
					});
				});
			}, function () {
				performThisStep(9);
			});
		} else if (stepNumber == 3) { // download a word list to search with
			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Fetching the trending search terms...", "&nbsp;", "&nbsp;");

			parseTrendingSearchTerms(function () {
				performThisStep(4);
			});
		} else if (stepNumber == 4) { // perform PC searches
			bp.status.change("DO_NOT_CHANGE", "&nbsp;", "DO_NOT_CHANGE");

			if (bp.helperTools.getHelperInstallionStatus()) {
				// GA tracking
				ga('send', 'event', 'Bing Pong', 'Statistics', 'Searches done', regularSearchesToPerform);

				bp.helperTools.openSearchWindow(function () {
					// since BPH is installed, we can check for the number of search credits that are missing (and we can use cached dashboard data)
					getSearchCreditCount(false, true, function (desktopSearchesAreComplete, numberOfDesktopCreditsObtained) {
						performSearchesBPH(regularSearchesToPerform - numberOfDesktopCreditsObtained*numberOfSearchesPerCredit, false, function () {
							// again, we can use cached dashboard data. check for missing mobile search and dashboard task credits
							getSearchCreditCount(true, true, function (mobileSearchesAreComplete, numberOfMobileCreditsObtained) {
								getNumberOfMissingDashboardTasks(false, true, function (numberOfTasksIncomplete) {
									if (!mobileSearchesAreComplete) {
										performThisStep(5);
									} else if (numberOfTasksIncomplete > 0 && document.getElementById('dashboardTasksOption').checked) {
										performThisStep(7);
									} else { // everything is done
										performThisStep(9);
									}
								});
							});
						});
					});
				});
			} else {
				// GA tracking
				ga('send', 'event', 'Bing Pong', 'Statistics', 'Searches done', numberOfDesktopSearches);

				performSearchesLegacy(numberOfDesktopSearches, function () {
					finishRunningBingPong();
				});
			}
		} else if (stepNumber == 5) { // perform mobile searches
			bp.status.change("DO_NOT_CHANGE", "&nbsp;", "DO_NOT_CHANGE");

			// update the account status if needed (as mobile searches and multiple accounts will be separated later)
			if (document.getElementById('multipleAccountsOption').checked) {
				document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<img src=\"loader.gif\" width=\"10\" height=\"10\"></img>";
			}

			// GA tracking
			ga('send', 'event', 'Bing Pong', 'Statistics', 'Searches done', mobileSearchesToPerform);

			bp.helperTools.openSearchWindow(function () {
				bp.helperTools.enableMobileMode(function () {
					getSearchCreditCount(true, true, function (mobileSearchesAreComplete, numberOfMobileCreditsObtained) {
						performSearchesBPH(mobileSearchesToPerform - 2*numberOfMobileCreditsObtained, true, function () {
							if (false) { // do trivia when done if the option is checked (placeholder code)
								performThisStep(6);
							} else if (document.getElementById('dashboardTasksOption').checked) { // if not, do the dashboard tasks if needed
								if (document.getElementById('multipleAccountsOption').checked) {
									// document.getElementById('status_tq' + currentAccountIndex).innerHTML = "<i class=\"fa fa-minus\"></i>";
								}

								getNumberOfMissingDashboardTasks(false, true, function (numberOfTasksIncomplete) {
									if (numberOfTasksIncomplete > 0 && document.getElementById('dashboardTasksOption').checked) {
										performThisStep(7);
									} else {
										performThisStep(9);
									}
								});
							} else { // otherwise, move to step 9
								if (document.getElementById('multipleAccountsOption').checked) {
									document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-minus\"></i>";
									// document.getElementById('status_tq' + currentAccountIndex).innerHTML = "<i class=\"fa fa-minus\"></i>";
								}

								performThisStep(9);
							}
						});
					});
				});
			});
		} else if (stepNumber == 6) { // do the trivia
			// to-do

			if (document.getElementById('dashboardTasksOption').checked) { // do dashboard tasks when done if the option is checked
				performThisStep(7);
			} else { // otherwise, move to step 9
				if (document.getElementById('multipleAccountsOption').checked) {
					document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-minus\"></i>";
				}

				performThisStep(9);
			}
		} else if (stepNumber == 7) { // get the list of dashboard tasks
			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Fetching the dashboard task list...", "&nbsp;", "&nbsp;");

			// update the account status if needed
			if (document.getElementById('multipleAccountsOption').checked) {
				document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<img src=\"loader.gif\" width=\"10\" height=\"10\"></img>";
			}

			parseDashboardForTasks(function () {
				performThisStep(8);
			});
		} else if (stepNumber == 8) { // perform the dasboard tasks
			performDashboardTasks(function () {
				performThisStep(9);
			});
		} else if (stepNumber == 9) { // account/run finished
			if (accountsDone == accountsToRun || !document.getElementById('multipleAccountsOption').checked) { // finished
				finishRunningBingPong();
			} else { // accounts remain, so continue
				var proceed = function () {
					if (document.getElementById('waitForIPChangeOption').checked && accountsDone % (document.getElementById('accountsPerIP').selectedIndex + 1) == 0) { // wait for an IP change if needed
						bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Waiting for an IP change...", "&nbsp;", "&nbsp;");
						waitForAnIPChange();
					} else { // move to the next account
						performThisStep(0);
					}
				};

				if (accountsDone >= 5) { // if 5 or more accounts have completed, check for a license before proceeding
					if (bp.licensing.getLicenseStatus()) { // is licensed, so proceed
						proceed();
					} else { // not licensed, so finish running Bing Pong
						finishRunningBingPong();
					}
				} else { // otherwise, just proceed
					proceed();
				}
			}
		} else {
			// more to come
		}
	}
}

function runBingPong() {
	bp.status.clearTimer();
	disableSearchOptions();
	bp.settings.disable(false);

	// change the "run Bing Pong" button into a stop buton
	document.getElementById('runBingPongButton').value = "Stop running Bing Pong";
	document.getElementById('runBingPongButton').onclick = stopRunningBingPong;

	if (document.getElementById('multipleAccountsOption').checked) {
		// prime the usernames/passwordsLeftToRun arrays
		usernamesLeftToRun = new Array();
		passwordsLeftToRun = new Array();

		for (var i = 1; i <= accountCount; i++) {
			// only add the account to the list if it is checked
			if (document.getElementById('check' + i).checked) {
				usernamesLeftToRun.push(accountUsernames[i]);
				passwordsLeftToRun.push(accountPasswords[i]);
			}
		}

		accountsToRun = usernamesLeftToRun.length;

		// GA tracking
		ga('send', 'event', 'Bing Pong', 'Statistics', 'Number of accounts', accountsToRun);

		// run the bot
		performThisStep(0);
	} else if (bp.helperTools.getHelperInstallionStatus()) { // bph is installed, but multiple accounts is not checked
		performThisStep(2);
	} else { // run in "legacy" mode
		performThisStep(3);
	}
}

function finishRunningBingPong() {
	accountsDone = 0;

	bp.settings.enable();

	if (bp.helperTools.getHelperInstallionStatus()) {
		if (location.href.indexOf("?runonpageload=1") != -1) {
			// Bing Pong was told to run by Bing Pong Helper automatically, so close the window
			chrome.runtime.sendMessage(bphExtensionID, {action: "closeBPWindow"}, function (response) {});
		} else {
			enableSearchOptions();
		}
	}

	if (document.getElementById('multipleAccountsOption').checked) {
		document.getElementById('runBingPongButton').value = "Run Bing Pong (" + accountCount + " accounts configured)";
	} else {
		document.getElementById('runBingPongButton').value = "Run Bing Pong (" + numberOfDesktopSearches + " searches)";
	}

	// reset the run button onclick since it was changed to a stop button
	document.getElementById('runBingPongButton').onclick = runBingPong;

	if (stopRunningBingPongFlag) { // Bing Pong was stopped in the middle of a run
		bp.status.reset();

		// update the account manager display if possible
		if (document.getElementById('multipleAccountsOption').checked) {
			updateAccountManagerDisplay();
		}

		// reset the flag so that the next run will not be impeded
		stopRunningBingPongFlag = false;
	} else {
		bp.status.changeTextWithDefaultTimeout("Done. <a href=\"http://www.bing.com/rewards/dashboard\" target=\"_blank\">Launch the Bing Rewards dashboard?</a>", "DO_NOT_CHANGE", "DO_NOT_CHANGE", 20000);
	}
}

function changeButtonText(newButtonText) {
	previousButtonText = document.getElementById('runBingPongButton').value;
	document.getElementById('runBingPongButton').value = newButtonText;
}

function revertButtonText() {
	document.getElementById('runBingPongButton').value = previousButtonText;
}

function parseTrendingSearchTerms(callback) {
	$.ajax({
		type: 'GET',
		dataType: 'text',
		url: 'keywords.php',
		success: function (data) {
			// parse the page for the keywords
			var temp = data.split("document.getElementById(\"search\").focus();'>");
			dictionary = new Array();

			// add each of the keywords to the dictionary
			for (var i = 1; i < temp.length; i++) {
				dictionary.push(temp[i].substring(0, temp[i].indexOf("</span>")));
			}

			// return to caller
			callback();
		},
		error: function (data) {
			parseTrendingSearchTerms(callback);
		}
	});
}

function getDashboardContents(callback) {
	bp.helperTools.performGETRequest("https://www.bing.com/rewards/dashboard", false, function (contents) {
		// update the global dashboardData variable
		dashboardData = contents;

		// return to caller
		callback();
	});
}

function parseDashboardContents(callbackOnSuccess, callbackOnBadAccount) {
	getDashboardContents(function () {
		// ban checks
		if (dashboardData.indexOf("up to 2 credits a day") != -1 ||
		dashboardData.indexOf("For a limited time you're earning free credits.") != -1 ||
		dashboardData.indexOf("This isn't a Bing Rewards account.") != -1) {
			document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
			document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
			document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
			document.getElementById('credits' + currentAccountIndex).style.color = "#FF0000";
			document.getElementById('accountName' + currentAccountIndex).style.color = "#FF0000";
			document.getElementById('credits' + currentAccountIndex).style.color = "#FF0000";
			document.getElementById('credits' + currentAccountIndex).innerHTML = "BANNED!!!";

			// continue with the next account
			callbackOnBadAccount();
			return;
		}

		// get the number of credits required to max out the PC search credits for the day
		if (dashboardData.indexOf("15 credits a day") != -1) {
			searchCountText = "15 credits a day";
			creditsToGet = 15;
		} else if (dashboardData.indexOf("15 credits per day") != -1) {
			searchCountText = "15 credits per day";
			creditsToGet = 15;
		} else if (dashboardData.indexOf("20 credits a day") != -1) {
			searchCountText = "20 credits a day";
			creditsToGet = 20;
		} else if (dashboardData.indexOf("30 credits a day") != -1) {
			searchCountText = "30 credits a day";
			creditsToGet = 30;
		} else if (dashboardData.indexOf("60 credits a day") != -1) {
			searchCountText = "60 credits a day";
			creditsToGet = 60;
		} else if (dashboardData.indexOf("Search with Bing on your PC and earn up to 5 times your daily credits") != -1 && data.responseText.indexOf("of 75 credits") != -1) {
			searchCountText = "Search with Bing on your PC and earn up to 5 times your daily credits";
			creditsToGet = 75;
		} else if (dashboardData.indexOf("Search with Bing on your PC and earn up to 5 times your daily credits") != -1 && data.responseText.indexOf("of 150 credits") != -1) {
			searchCountText = "Search with Bing on your PC and earn up to 5 times your daily credits";
			creditsToGet = 150;
		} else { // fail account
			document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
			document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
			document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-exclamation-triangle\"></i>";
			document.getElementById('credits' + currentAccountIndex).style.color = "#FFFF00";
			document.getElementById('accountName' + currentAccountIndex).style.color = "#FFFF00";
			document.getElementById('credits' + currentAccountIndex).style.color = "#FFFF00";
			document.getElementById('credits' + currentAccountIndex).innerHTML = "BLOCKED";

			// continue with the next account
			callbackOnBadAccount();
			return;
		}

		// append " Start with US news." to the searchCountText (v0.20.47)
		searchCountText += ". Start with US news.";

		// get the number of searches required to get one credit from PC searching
		numberOfSearchesPerCredit = ((dashboardData.indexOf("PC search</span><span class=\"desc\">Earn 1 credit per 2 Bing searches") != -1) ? 2 : 3);

		// set the number of searches Bing Pong needs to do
		regularSearchesToPerform = numberOfSearchesPerCredit*creditsToGet;

		// if applicable, fetch the number of credits the account has and update the display
		if (document.getElementById('multipleAccountsOption').checked) {
			updateCreditCounter(dashboardData, false);
		}

		// return to caller
		callbackOnSuccess();
	});
}

function generateSearchURL(doMobileSearches, callback) {
	var url = "";
	var searchExpression;

	// use a random wiki article if BPH is installed, and a trending search term otherwise
	if (bp.helperTools.getHelperInstallionStatus()) {
		if (dictionary && dictionary.length) { // if there are search terms remaining from the last time we got the wiki articles
			// just use one of those to make a search
			searchExpression = ((dictionary.pop()).split(" ")).join("+"); // replace spaces with pluses

			if (doMobileSearches) {
				// match the URL scheme used by Bing when searching from the front page
				url += "http://www.bing.com/search?q=" + searchExpression + "&qs=n&form=QBLH&pq=" + searchExpression + "&sc=12-" + searchExpression.length + "&sp=-1&sk=";
			} else {
				// match the URL scheme used by the Bing Rewards Chrome extension
				url += "https://www.bing.com/search?FORM=U312DF&PC=U312&q=" + searchExpression;
			}

			// return to caller
			callback(url);
		} else { // otherwise, get ten wiki articles and generate a URL with those
			bp.helperTools.getWikiArticles(function (queries) {
				dictionary = queries;
				generateSearchURL(doMobileSearches, callback);
			});
		}
	} else { // BPH is not installed --- note that this means that we do not need to check for the doMobileSearches flag
		searchExpression = ((dictionary[Math.floor(dictionary.length * Math.random())].toLowerCase()).split(" ")).join("+"); // replace spaces with pluses

		if (redirectionServiceRequired) {
			url += REDIRECTION_SERVICE;
		}

		// match the URL scheme used by the Bing Rewards Chrome extension
		url += "https://www.bing.com/search?FORM=U312DF&PC=U312&q=" + searchExpression;

		// return to caller
		callback(url);
	}
}

function getMinSearchDelayTime() {
	return 1000*(document.getElementById('useSearchDelayOption').checked ? minSearchDelayTime : 0);
}

function getMaxSearchDelayTime() {
	return 1000*(document.getElementById('useSearchDelayOption').checked ? maxSearchDelayTime : 0);
}

function handleSearchCaptcha(numberOfSearches, doMobileSearches, callback) {
	// GA tracking
	ga('send', 'event', 'Bing Pong', 'Statistics', 'Search CAPTCHA');

	bp.status.changeWithTimeout("A CAPTCHA has been detected during searching.", "To solve it, you will be taken there in %d second(s).", "&nbsp;", CAPTCHA_MESSAGE_TIMEOUT, function () {
		bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Opening the CAPTCHA...", "&nbsp;", "&nbsp;");
		bp.helperTools.bringSearchCaptchaIntoFocus(function () {
			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Waiting for the CAPTCHA to be solved...", "This message will disappear once you have solved the CAPTCHA.", "&nbsp;");
			var captchaInterval = setInterval(function () {
				bp.helperTools.checkForSearchCaptcha(function (tabIsDead, captchaDetected) {
					if (!captchaDetected) {
						clearInterval(captchaInterval);

						bp.helperTools.moveSearchCaptchaBack(function () {
							if (stopRunningBingPongFlag) {
								// we need to call performThisStep() again to get Bing Pong to stop
								bp.helperTools.disableMobileMode(function () {
									bp.helperTools.closeSearchWindow(function () {
										performThisStep(0);
									});
								});
							} else {
								bp.status.change("DO_NOT_CHANGE", "&nbsp;", "&nbsp;");
								performSearchesBPH(numberOfSearches, doMobileSearches, callback);
							}
						});
					}
				});
			}, 3000);
		});
	});
}

function performSearchesBPH(numberOfSearches, doMobileSearches, callback) {
	if (searchAttemptCount <= MAX_NUMBER_OF_SEARCH_ATTEMPTS) { // search attempts remaining
		// update the display
		if (doMobileSearches) {
 			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Performing mobile searches...", "DO_NOT_CHANGE", "DO_NOT_CHANGE");
 		} else {
 			bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Performing searches...", "DO_NOT_CHANGE", "DO_NOT_CHANGE");
 		}

 		// request Bing Pong Helper to do a search
 		generateSearchURL(doMobileSearches, function (url) {
			chrome.runtime.sendMessage(bphExtensionID, {action: "performSearch", searchURL: url, minDelay: getMinSearchDelayTime(), maxDelay: getMaxSearchDelayTime()}, function (response) {
				var continueSearching;

				var checkForCaptcha = function () {
					bp.helperTools.checkForSearchCaptcha(function (tabIsDead, captchaDetected) {
						if (stopRunningBingPongFlag) {
							// we need to call performThisStep() again to get Bing Pong to stop
							bp.helperTools.disableMobileMode(function () {
								bp.helperTools.closeSearchWindow(function () {
									performThisStep(0);
								});
							});
						} else if (tabIsDead) {
							continueSearching();
						} else if (captchaDetected) { // search captcha detected
							handleSearchCaptcha(numberOfSearches, doMobileSearches, callback);
						} else { // no captcha
							// update the credit counter with fresh data from the search window
							bp.helperTools.getSearchWindowContents(function (contents) {
								if (document.getElementById('multipleAccountsOption').checked) {
									updateCreditCounter(contents, true);
								}
							});

							continueSearching();
						}
					});
				};

				checkForCaptcha();

				continueSearching = function () {
					numberOfSearches--;

					if (doMobileSearches) {
						if (numberOfSearches == 1) {
							bp.status.change("DO_NOT_CHANGE", "1 mobile search remaining", "DO_NOT_CHANGE");
						} else {
							bp.status.change("DO_NOT_CHANGE", numberOfSearches + " mobile searches remaining", "DO_NOT_CHANGE");
						}
					} else {
						if (numberOfSearches == 1) {
							bp.status.change("DO_NOT_CHANGE", "1 search remaining", "DO_NOT_CHANGE");
						} else {
							bp.status.change("DO_NOT_CHANGE", numberOfSearches + " searches remaining", "DO_NOT_CHANGE");
						}
					}

					// recursively call this function until all searches are completed
					if (numberOfSearches > 0) {
						performSearchesBPH(numberOfSearches, doMobileSearches, callback);
					} else {
						// verify searches and return to caller
						if (doMobileSearches) {
							bp.helperTools.disableMobileMode(function () {
								verifySearches(doMobileSearches, callback);
							});
						} else {
							verifySearches(doMobileSearches, callback);
						}
					}
				};
			});
		});
	} else { // searches failed
		// reset the search attempt counter
		searchAttemptCount = 0;

		// update the account status
		if (doMobileSearches) {
			document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-times\"></i>";

			// disable mobile mode and return to caller
			bp.helperTools.disableMobileMode(function () {
				callback();
			});
		} else {
			document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-times\"></i>";

			// return to caller
			callback();
		}
	}
}

function performSearchesLegacy(numberOfSearches, callback) {
	searchAttemptCount++;

	// update the display
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Performing searches...", numberOfSearches + " searches remaining", "DO_NOT_CHANGE");

 	if (redirectionServiceRequired) {
 		var searchOccurred = false;

 		// set up a search in the iframe
 		generateSearchURL(false, function (url) {
			document.getElementById('searchFrame').src = url;
		});

		// the redirection service causes the iframe to load twice per search, so we need to consider a search done only after the onload fires twice
		document.getElementById('searchFrame').onload = function () {
			setTimeout(function () {
				if (stopRunningBingPongFlag) {
					// we need to call performThisStep() again to get Bing Pong to stop
					performThisStep(0);
				} else if (searchOccurred) {
					numberOfSearches--;
					searchOccurred = false;

					if (numberOfSearches > 0) { // searches are incomplete
						generateSearchURL(false, function (url) {
							document.getElementById('searchFrame').src = url;
						});

						if (numberOfSearches == 1) {
							bp.status.change("DO_NOT_CHANGE", "1 search remaining", "DO_NOT_CHANGE");
						} else {
							bp.status.change("DO_NOT_CHANGE", numberOfSearches + " searches remaining", "DO_NOT_CHANGE");
						}
					} else { // searches are complete
						// remove onload handler from the iframe
						document.getElementById('searchFrame').onload = function () {};

						// clear the remaining indicator
						bp.status.change("DO_NOT_CHANGE", "&nbsp;", "DO_NOT_CHANGE");

						// return to caller
						callback();
					}
				} else {
					searchOccurred = true;
				}
			}, 10 + getMinSearchDelayTime() + (getMaxSearchDelayTime() - getMinSearchDelayTime() - 10)*Math.random());
		}
	} else {
		generateSearchURL(false, function (url) {
			document.getElementById('searchFrame').src = url;
		});

		document.getElementById('searchFrame').onload = function () {
			setTimeout(function () {
				numberOfSearches--;

				if (numberOfSearches > 0) { // searches are incomplete
					generateSearchURL(false, function (url) {
						document.getElementById('searchFrame').src = url;
					});

					if (numberOfSearches == 1) {
						bp.status.change("DO_NOT_CHANGE", "1 search remaining", "DO_NOT_CHANGE");
					} else {
						bp.status.change("DO_NOT_CHANGE", numberOfSearches + " searches remaining", "DO_NOT_CHANGE");
					}
				} else { // searches are complete
					// remove onload handler from the iframe
					document.getElementById('searchFrame').onload = function () {};

					// clear the remaining indicator
					bp.status.change("&nbsp;", "&nbsp;", "DO_NOT_CHANGE");

					// return to caller
					callback();
				}
			}, 10 + getMinSearchDelayTime() + (getMaxSearchDelayTime() - getMinSearchDelayTime() - 10)*Math.random());
		};
	}
}

function getSearchCreditCount(doMobileSearches, useCachedDashboardData, callback) {
	var proceed = function () {
		if (doMobileSearches) {
			if (dashboardData.indexOf("Earn 1 credit per 2 Bing searches up to 10 credits a day.</span></span><div class=\"check-wrapper tile-height\"><div class=\"check close-check dashboard-sprite\"></div></div><div class=\"progress\">10 credits") == -1) { // mobile searches are incomplete
				var tempString = "Earn 1 credit per 2 Bing searches up to 10 credits a day.</span></span><div class=\"check-wrapper tile-height\"><div class=\"check open-check dashboard-sprite\"></div></div><div class=\"progress\">";
				callback(false, dashboardData.substring(dashboardData.indexOf(tempString) + 191, dashboardData.indexOf(tempString) + 192));
			} else { // mobile searches are complete
				callback(true, 10);
			}
		} else {
			if (dashboardData.indexOf("<div class=\"progress\">" + creditsToGet + " credits") == -1) { // PC searches are incomplete
				callback(false, dashboardData.substring(dashboardData.indexOf(searchCountText) + 134 + searchCountText.length, dashboardData.indexOf(searchCountText) + 136 + searchCountText.length));
			} else { // PC searches are complete
				callback(true, creditsToGet);
			}
		}
	};

	if (useCachedDashboardData) {
		proceed();
	} else {
		getDashboardContents(proceed);
	}
}

function verifySearches(doMobileSearches, callback) {
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Checking for any missing search credits...", "&nbsp;", "&nbsp;");

	getSearchCreditCount(doMobileSearches, false, function (searchesAreComplete, numberOfNewCredits) {
		// if applicable, update the credit counter
		if (document.getElementById('multipleAccountsOption').checked) {
			updateCreditCounter(dashboardData, false);
		}

		if (doMobileSearches) {
	 		if (!searchesAreComplete) { // mobile searches are incomplete
	 			searchAttemptCount++;

	 			bp.helperTools.enableMobileMode(function () {
	 				if (stopRunningBingPongFlag) {
	 					// we need to call performThisStep() again to get Bing Pong to stop
	 					bp.helperTools.disableMobileMode(function () {
	 						bp.helperTools.closeSearchWindow(function () {
	 							performThisStep(0);
	 						});
	 					});
	 				} else {
	 					// GA tracking
						ga('send', 'event', 'Bing Pong', 'Statistics', 'Searches done', 20 - 2*numberOfNewCredits);

		 				performSearchesBPH(20 - 2*numberOfNewCredits, true, callback);
		 			}
	 			});
	 		} else { // mobile searches are complete
	 			// if applicable, update the account status
	 			if (document.getElementById('multipleAccountsOption').checked) {
	 				document.getElementById('status_ms' + currentAccountIndex).innerHTML = "<i class=\"fa fa-check\"></i>";
	 			}

	 			// return to the caller
	 			bp.helperTools.closeSearchWindow(function () {
		 			bp.helperTools.disableMobileMode(function () {
		 				callback();
		 			});
		 		});
	 		}
	 	} else {
	 		if (!searchesAreComplete) { // PC searches are incomplete
	 			searchAttemptCount++;

	 			if (stopRunningBingPongFlag) {
	 				// we need to call performThisStep() again to get Bing Pong to stop
	 				bp.helperTools.closeSearchWindow(function () {
	 					performThisStep(0);
	 				});
	 			} else {
	 				// GA tracking
					ga('send', 'event', 'Bing Pong', 'Statistics', 'Searches done', numberOfSearchesPerCredit*(creditsToGet - numberOfNewCredits));

		 			performSearchesBPH(numberOfSearchesPerCredit*(creditsToGet - numberOfNewCredits), false, callback);
		 		}
	 		} else { // PC searches are complete
				// if applicable, update the account status
				if (document.getElementById('multipleAccountsOption').checked) {
					document.getElementById('status' + currentAccountIndex).innerHTML = "<i class=\"fa fa-check\"></i>";
				}

	 			// return to caller
	 			bp.helperTools.closeSearchWindow(callback);
	 		}
	 	}
	});
}

function parseDashboardForTasks(callback) {
	getDashboardContents(function () {
		var temp = dashboardData.split("rewardsapp/redirect?url");
		var temp2 = new Array();

		for (var i = 0; i < temp.length - 1; i++) {
			temp2[i] = "https://www.bing.com/rewardsapp/redirect?url" + temp[i + 1].substring(temp[i + 1].indexOf("="), temp[i + 1].indexOf("\""));
			dashboardTaskURLs[i] = (temp2[i].split("amp;")).join("");
		}

		temp2[temp.length - 1] = "https://www.bing.com/rewardsapp/redirect?url" + temp[temp.length - 1].substring(temp[temp.length - 1].indexOf("="), temp[temp.length - 1].indexOf("\""));
   		dashboardTaskURLs[temp.length - 1] = (temp2[temp.length - 1].split("amp;")).join("");

   		// re-use temp
   		temp = new Array();

   		// remove duplicate task URLs
   		for (var i = 0; i < dashboardTaskURLs.length; i++) {
   			var alreadyInTemp = false;

   			for (var j = 0; j < temp.length; j++) {
   				if (dashboardTaskURLs[i].substring(0, 150) == temp[j].substring(0, 150)) {
   					alreadyInTemp = true;
   					break;
   				}
   			}

   			if (!alreadyInTemp) {
   				temp[temp.length] = dashboardTaskURLs[i];
   			}
   		}

   		// move the elements of temp back into dashboardTaskURLs
   		dashboardTaskURLs = new Array();
   		for (var i = 0; i < temp.length; i++) {
   			dashboardTaskURLs[i] = temp[i];
   		}
/*
   		// tour complete? if not, add it to the list of dashboard tasks
   		if (dashboardData.indexOf("See how it works") != -1) {
   			dashboardTaskURLs.push("https://www.bing.com/rewardsapp/redirect?url=%2frewards%2fdashboard&id=sst_welcome1&hash=f22dc588e49db0572ee93fad4bb5d8f0&state=Active&rcid=4&aid=urlreward&bruid=&ml=&rh=");
   		}
*/
   		// remove the trivia task from the list of tasks to do
   		for (var i = 0; i < dashboardTaskURLs.length; i++) {
   			if (dashboardTaskURLs[i].indexOf("raid=quiz&amp;") != -1) {
   				dashboardTaskURLs.splice(i, 1);
   				break;
   			}
   		}

		// remove any completed tasks from the list of tasks to do
		for (var i = 0; i < dashboardTaskURLs.length; i++) {
			if (dashboardTaskURLs[i].indexOf("state=Completed") != -1) {
				dashboardTaskURLs.splice(i, 1);
			}
		}

   		// return to caller
   		callback();
	});
}


function performDashboardTasks(callback) {
	dashboardTaskAttemptCount++;

	// update the display
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Performing dashboard tasks...", "&nbsp;", "&nbsp;");

	// request Bing Pong Helper to open the tasks in new tabs, and return to caller when finished
	chrome.runtime.sendMessage(bphExtensionID, {action: "performTasks", taskList: dashboardTaskURLs}, function () {
		if (stopRunningBingPongFlag) {
			// we need to call performThisStep() again to get Bing Pong to stop
			performThisStep(0);
		} else {
			verifyDashboardTasks(callback);
		}
	});
}

function waitForAnIPChange() {
	document.getElementById('remaining').innerHTML = "Current IP: <span id='ipLoader'></span><span id='ipText'></span>";

	var fetchNewIPs = function () {
		if (stopRunningBingPongFlag) {
			// we need to call performThisStep() again to get Bing Pong to stop
			performThisStep(0);
		} else {
			document.getElementById('ipLoader').innerHTML = "<i class=\"fa fa-refresh fa-spin\"></i>";

			performGETRequest("http://ip-api.com/json/?fields=8193", true, function (contents) {
				if (!initialIP && contents.query) { // set the initial IP and poll for new IPs
					initialIP = contents.query;
					document.getElementById('ipText').innerHTML = initialIP;
					document.getElementById('ipLoader').innerHTML = "<img src=\"blue10.png\" width=\"11\" height=\"11\"></img>";
					setTimeout(fetchNewIPs, 5000);
				} else {
					if (!contents.query) {
						setTimeout(fetchNewIPs, 5000);
					} else if (contents.query != initialIP && contents.country == "United States") { // IP has changed and is from the US, so continue
						initialIP = 0;
						document.getElementById('ipLoader').innerHTML = "<i class=\"fa fa-check\"></i>";
						document.getElementById('ipText').innerHTML = contents.query;
						setTimeout(function () {
							performThisStep(0);
						}, 1000);
					} else if (contents.country != "United States") { // non-US IP, so warn user and poll for new IPs
						document.getElementById('ipLoader').innerHTML = "<img src=\"blue10.png\" width=\"11\" height=\"11\"></img>";
						document.getElementById('ipText').innerHTML = "<font color='red'>" + contents.query + '</font>'
						document.getElementById('extra').innerHTML = "(Your IP is not from the United States. Bing Pong will not continue until it gets a US-based IP.)";
						setTimeout(fetchNewIPs, 5000);
					} else {
						setTimeout(fetchNewIPs, 5000);
					}
				}
			});
		}
	}

	fetchNewIPs();
}

function getNumberOfMissingDashboardTasks(includeTrivia, useCachedDashboardData, callback) {
	var proceed = function () {
		var numberOfTasksIncomplete = dashboardData.substring(0, dashboardData.indexOf("Every day ways to earn")).split("check open-check dashboard-sprite").length - 1;

		if (!includeTrivia) {
			numberOfTasksIncomplete -= dashboardData.substring(0, dashboardData.indexOf("Every day ways to earn")).split("raid=quiz&amp;").length - 1;
		}

		callback(numberOfTasksIncomplete);
	};

	if (useCachedDashboardData) {
		proceed();
	} else {
		getDashboardContents(proceed);
	}
}

function verifyDashboardTasks(callback) {
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Checking for any missing dashboard task credits...", "&nbsp;", "&nbsp;");

	getNumberOfMissingDashboardTasks(false, false, function (numberOfTasksIncomplete) {
		// if applicable, update the credit counter
		if (document.getElementById('multipleAccountsOption').checked) {
			updateCreditCounter(dashboardData, false);
		}

		if (numberOfTasksIncomplete > 0) { // tasks failed
			if (stopRunningBingPongFlag) {
				// we need to call performThisStep() again to get Bing Pong to stop
				performThisStep(0);
			} else {
				performDashboardTasks(callback);
			}
		} else { // tasks successfully completed
			// update the account status if needed
			if (document.getElementById('multipleAccountsOption').checked) {
				document.getElementById('status_dt' + currentAccountIndex).innerHTML = "<i class=\"fa fa-check\"></i>";
			}

			// return to caller
			callback();
		}
	});
}

function enableSearchOptions() {
	document.getElementById('numberOfDesktopSearches').disabled = false;

	if (bp.helperTools.getHelperInstallionStatus()) {
		document.getElementById('numberOfMobileSearches').disabled = false;
	}
}

function disableSearchOptions() {
	document.getElementById('numberOfDesktopSearches').disabled = true;
	document.getElementById('numberOfMobileSearches').disabled = true;
}

function enterAutoInSearchBoxes() {
	document.getElementById('numberOfDesktopSearches').value = "auto";
	document.getElementById('numberOfMobileSearches').value = "auto";
}

function disableMobileSearchOption() {
	document.getElementById('numberOfMobileSearches').disabled = true;
	document.getElementById('numberOfMobileSearches').value = "------";
}

function restoreSearchBoxes() {
	// stub
}

function hideAccountManagerDisplay() {
	document.getElementById('accountManager').innerHTML = "";
}

function updateAccountManagerDisplay() {
	// document.getElementById('accountManager').innerHTML = "<b>Bing Rewards accounts currently linked with Bing Pong:</b>";
	// document.getElementById('accountManager').innerHTML = "<table class=\"optionsTable\"><tr class=\"optionsTable\"><td class=\"optionsTable\"><select disabled><option>Main account group</option></select><span style=\"float: right\">This group's last run time: <b>N/A</b></span></td><tr class=\"optionsTable\"><td class=\"optionsTable\"><table id=\"accountsTable\"></table></td></tr></table>";
	document.getElementById('accountManager').innerHTML = "<table class=\"optionsTable\"><tr class=\"optionsTable\"><td class=\"optionsTable\"><!--<select disabled><option>Main account group</option></select><span style=\"float: right\">This group's last run time: <b>N/A</b></span>--></td><tr class=\"optionsTable\"><td class=\"optionsTable\"><table id=\"accountsTable\"></table></td></tr></table>";

	if (bp.cookies.get("accountCount") && bp.cookies.get("accountCount") !== "0") {
		// delete all account data currently stored in the arrays (not in the cookies)
		accountUsernames.length = 0;
		accountPasswords.length = 0;
		accountCredits.length = 0;
		accountRedeemStatuses.length = 0;

		// insert header
		var accountsTable = document.getElementById('accountsTable');
		var headerRow = accountsTable.insertRow(-1);
		var cmHeaderCell = headerRow.insertCell(0);
		var dsHeaderCell = headerRow.insertCell(1);
		var msHeaderCell = headerRow.insertCell(2);
		var dtHeaderCell = headerRow.insertCell(3);
		var usernameHeaderCell = headerRow.insertCell(4);
		var creditsHeaderCell = headerRow.insertCell(5);
		var optionsHeaderCell = headerRow.insertCell(6);

		cmHeaderCell.innerHTML = "<center><input type=checkbox id=\"globalCheckmark\"  " + ((!bp.cookies.get("globalCheck") || bp.cookies.get("globalCheck") === "true") ? "checked" : "") + " " + (accountsDone ? "disabled" : "") + " onclick=\"onGlobalCheckmarkChange();\"></center>";
		dsHeaderCell.innerHTML = "<center><i class=\"fa fa-laptop fa-lg\"></i></center>";
		msHeaderCell.innerHTML = "<center><i class=\"fa fa-mobile fa-lg\"></i></center>";
		// tqHeaderCell.innerHTML = "<center><i class=\"fa fa-question-circle fa-lg\"></i></center>";
		dtHeaderCell.innerHTML = "<center><i class=\"fa fa-flag fa-lg\"></i></center>";
		usernameHeaderCell.innerHTML = "<center><b>Usernames</b></center>";
		creditsHeaderCell.innerHTML = "<center><b>Credits</b></center>";
		optionsHeaderCell.innerHTML = "<center><b>Options</b></center>";

		for (var i = 1; i <= bp.cookies.get("accountCount"); i++) {
			// populate the rows
			var row = accountsTable.insertRow(-1);
			var checkmarkCell = row.insertCell(0);
			var dsStatusCell = row.insertCell(1);
			var msStatusCell = row.insertCell(2);
			var dtStatusCell = row.insertCell(3);
			var usernameCell = row.insertCell(4);
			var creditsCell = row.insertCell(5);
			var optionsCell = row.insertCell(6);

			checkmarkCell.innerHTML = "<center><input type=checkbox id=\"check" + i + "\" " + ((!bp.cookies.get("check" + i) || bp.cookies.get("check" + i) === "true") ? "checked" : "") + " " + (accountsDone ? "disabled" : "") + " onclick=\"onAccountCheckmarksChange();\"></center>";
			dsStatusCell.innerHTML = "<center><span id=\"status" + i + "\"><img src=\"../blue10.png\" width=\"10\" height=\"10\"></img></span></center>";
			msStatusCell.innerHTML = "<center><span id=\"status_ms" + i + "\"><img src=\"../blue10.png\" width=\"10\" height=\"10\"></img></span></center>";
			// tqStatusCell.innerHTML = "<center><span id=\"status_tq" + i + "\"><img src=\"../blue10.png\" width=\"10\" height=\"10\"></img></span></center>";;
			dtStatusCell.innerHTML = "<center><span id=\"status_dt" + i + "\"><img src=\"../blue10.png\" width=\"10\" height=\"10\"></img></span></center>";
			usernameCell.innerHTML = "<span id=\"accountName" + i + "\">" + bp.cookies.get("username" + i) + "</span>&nbsp;&nbsp;&nbsp;";
			creditsCell.innerHTML = "<center><span id=\"credits" + i + "\"></span></center>";
			optionsCell.innerHTML = "<a href=\"#\" onclick=\"launchDashboardForAccount(" + i + ");return false;\">Dashboard</a>&nbsp;&nbsp;&nbsp;<a href=\"#\" onclick=\"launchEmailForAccount(" + i + ");return false;\">Outlook</a>&nbsp;&nbsp;&nbsp;<a href=\"#\" onclick=\"removeAccount(" + i + ");return false;\">Remove</a>";

			// fetch the account information from the cookies and store them into the arrays for Bing Pong to use
			accountUsernames[i] = bp.cookies.get("username" + i);
			accountPasswords[i] = bp.cookies.get("password" + i);
			accountCredits[i] = (bp.cookies.get("credits" + i) ? bp.cookies.get("credits" + i) : "N/A");
			document.getElementById('credits' + i).innerHTML = accountCredits[i];
			accountRedeemStatuses[i] = bp.cookies.get("isRedeemable" + i);

			// visually show an accounts redeem status
			document.getElementById('credits' + i).style.color = ((accountRedeemStatuses[i] === "true") ? "#00FF00" : "#FAFAFA");
			document.getElementById('accountName' + i).style.color = ((accountRedeemStatuses[i] === "true") ? "#00FF00" : "#FAFAFA");

			// fetch the value of accountCount
			accountCount = bp.cookies.get("accountCount");
		}

		// update the "Run Bing Pong" button to show the number of accounts, but only do it if the but is not running
		if (!accountsDone) {
			changeButtonText("Run Bing Pong (" + accountCount + (accountCount == 1 ? " account" : " accounts") + " configured)");
		}

   		// add a section to add accounts below the account list
   		document.getElementById('accountManager').innerHTML += "</table><br><br>";
		updateAddAccountSection();

		// if an account is not checked, dash it out
		for (var i = 1; i <= accountCount; i++) {
			// only add the account to the list if it is checked
			if (!document.getElementById('check' + i).checked) {
				document.getElementById('status' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
				document.getElementById('status_ms' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
				// document.getElementById('status_tq' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
				document.getElementById('status_dt' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
			}
		}

		// if there are more than 5 accounts in the list, check for a BPH license
		if (accountCount > 5) {
			if (bp.licensing.getLicenseStatus()) {
				// do nothing for now
			} else {
				// update the statuses to reflect that Bing Pong will not run anything below the first 5 accounts
				for (var i = 6; i <= accountCount; i++) {
					document.getElementById('check' + i).disabled = true;
					document.getElementById('check' + i).checked = false;
					document.getElementById('status' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
					document.getElementById('status_ms' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
					// document.getElementById('status_tq' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
					document.getElementById('status_dt' + i).innerHTML = "<i class=\"fa fa-minus\"></i>";
					document.getElementById('accountName' + i).innerHTML = "<strike>" + bp.cookies.get("username" + i) + "</strike>";
					document.getElementById('credits' + i).innerHTML = "<strike>" + (bp.cookies.get("credits" + i) ? bp.cookies.get("credits" + i) : "N/A") + "</strike>";
				}
			}
		}
	} else {
		changeButtonText("Run Bing Pong (0 accounts configured)");

		document.getElementById('accountManager').innerHTML = "<br><b>No accounts are currently linked with Bing Pong. Link an account via the options below.</b><br><br>";
		updateAddAccountSection();
   	}
}

function updateAddAccountSection() {
	if (sectionToDisplay == 1) { // add accounts one at a time (with verification)
		document.getElementById('accountManager').innerHTML += "<form name=\"add\"><input type=\"radio\" id=\"manager1\" name=\"add1\" onclick=\"changeAddAccountSection()\" checked>Add one account&nbsp;&nbsp;&nbsp;<input type=\"radio\" id=\"manager2\" name=\"add1\" onclick=\"changeAddAccountSection()\">Add accounts in bulk&nbsp;&nbsp;&nbsp;<input type=\"radio\" id=\"manager3\" name=\"add1\" onclick=\"changeAddAccountSection()\">Export accounts</form><span id=\"accountAdder\"></span>";

		// show the add account section if there are less than 5 accounts linked or if the user has a license
		if (accountCount < 5 || bp.licensing.getLicenseStatus()) {
			document.getElementById('accountAdder').innerHTML = "<b>Add an account:</b><br>E-mail:<input placeholder=\"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Microsoft Live\" id=\"username\" size=30><br>Password:<input type=\"password\" placeholder=\"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Password\" id=\"password\" size=25><br><input type=button id=\"addAccountButton\" value=\"Add account\" onclick=\"addAccountInManager()\">";
		} else { // not qualified to add more accounts (>5 accounts and no license)
			document.getElementById('accountAdder').innerHTML = "<b>To link another account to Bing Pong, you must either remove an already linked account or purchase a Bing Pong Helper license.<br>You may purchase a license from the Bing Pong Helper options page.</b>";
		}
	} else if (sectionToDisplay == 2) { // add accounts in bulk
		document.getElementById('accountManager').innerHTML += "<form name=\"add\"><input type=\"radio\" id=\"manager1\" name=\"add1\" onclick=\"changeAddAccountSection()\">Add one account&nbsp;&nbsp;&nbsp;<input type=\"radio\" id=\"manager2\" name=\"add1\" onclick=\"changeAddAccountSection()\" checked>Add accounts in bulk&nbsp;&nbsp;&nbsp;<input type=\"radio\" id=\"manager3\" name=\"add1\" onclick=\"changeAddAccountSection()\">Export accounts</form><span id=\"accountAdder\"></span>";

		// check for a license, and only show the account adding section if licensed
		if (bp.licensing.getLicenseStatus()) {
			document.getElementById('accountAdder').innerHTML = "<b>Add accounts in bulk:</b><br><i>Add each account's information in the format <b>username:password</b> and enter one account per line.<br>(<b>NOTE: The account credentials you supply will not be verified. Make sure they are correct.</b>)</i><br><textarea id=\"bulkField\" rows=8 cols=65></textarea><br><input type=button id=\"bulk_button\" value=\"Add accounts\" onClick=\"addAccountsInBulk()\">";
		} else {
			document.getElementById('accountAdder').innerHTML = "<b>Adding accounts in bulk requires a Bing Pong Helper license.<br>You may purchase a license from the Bing Pong Helper options page.</b>";
		}
	} else { // exporter
		document.getElementById('accountManager').innerHTML += "<form name=\"add\"><input type=\"radio\" id=\"manager1\" name=\"add1\" onclick=\"changeAddAccountSection()\">Add one account&nbsp;&nbsp;&nbsp;<input type=\"radio\" id=\"manager2\" name=\"add1\" onclick=\"changeAddAccountSection()\">Add accounts in bulk&nbsp;&nbsp;&nbsp;<input type=\"radio\" id=\"manager3\" name=\"add1\" onclick=\"changeAddAccountSection()\" checked>Export accounts</form><span id=\"accountAdder\"></span>";
		document.getElementById('accountAdder').innerHTML = "<b>Coming soon...</b>";
	}

	document.getElementById('accountManager').innerHTML += "<br><br><br><br><br>";
}

function changeAddAccountSection() {
	if (document.getElementById('manager1').checked) {
		sectionToDisplay = 1;
	} else if (document.getElementById('manager2').checked) {
		sectionToDisplay = 2;
	} else {
	 	sectionToDisplay = 3;
	}

	updateAccountManagerDisplay();
}

function addAccountInManager() {
	bp.settings.disable(true);
	bp.status.clearTimer();
	document.getElementById('username').disabled = true;
	document.getElementById('password').disabled = true;
	document.getElementById('addAccountButton').disabled = true;
	bp.status.change("<img src=\"loader.gif\" width=\"16\" height=\"16\"></img> Verifying account credentials...", "&nbsp;", "&nbsp;");

	addAccount(document.getElementById('username').value, document.getElementById('password').value, true, function () { // successful add
		bp.settings.enable();
		document.getElementById('username').disabled = false;
		document.getElementById('password').disabled = false;
		document.getElementById('addAccountButton').disabled = false;

		bp.status.change(accountUsernames[accountCount] + " has been successfully added to Bing Pong.", "DO_NOT_CHANGE", "DO_NOT_CHANGE");
		statusTimeout = setTimeout(function () {
			bp.status.change(DEFAULT_STATUS_TEXT, "&nbsp;", "&nbsp;");
		}, GOOD_LOGIN_MESSAGE_TIMEOUT);
	}, function () { // bad login info
		bp.settings.enable();
		document.getElementById('username').disabled = false;
		document.getElementById('password').disabled = false;
		document.getElementById('addAccountButton').disabled = false;

		tempSeconds = BAD_LOGIN_WARNING_TIMEOUT;
		bp.status.change("There was is an issue logging into this account.", "Verify that your account is in good standing and try again.", "This message will disappear in " + tempSeconds + " seconds.");
		statusTimeout = setInterval(function () {
			tempSeconds--;

			if (tempSeconds > 1) {
				bp.status.change("DO_NOT_CHANGE", "DO_NOT_CHANGE", "This message will disappear in " + tempSeconds + " seconds.");
			} else if (tempSeconds == 1) {
				bp.status.change("DO_NOT_CHANGE", "DO_NOT_CHANGE", "This message will disappear in 1 second.");
			} else {
				bp.status.change(DEFAULT_STATUS_TEXT, "&nbsp;", "&nbsp;");
				bp.status.clearTimer();
			}
		}, 1000);
	}, function () { // logout problems
		bp.settings.enable();
		document.getElementById('username').disabled = false;
		document.getElementById('password').disabled = false;
		document.getElementById('addAccountButton').disabled = false;
		bp.status.reset();
		bpAlert("There was an issue logging out of the previous account. Please contact me for further assistance.");
	});
}

function addAccountsInBulk() {
	var fieldLines = (document.getElementById('bulkField').value).split('\n');

   	for (var i = 0; i < fieldLines.length; i++) {
		tempUsername = fieldLines[i].substring(0, fieldLines[i].indexOf(':'));
		tempPassword = fieldLines[i].substring(fieldLines[i].indexOf(':') + 1, fieldLines[i].length);
		var dupAccount = false;

		// check for a duplicate account
		for (var j = 1; j <= accountCount; j++) {
			if (accountUsernames[j] == tempUsername) {
				dupAccount = true;
			}
		}

		if (fieldLines[i].indexOf(':') != -1 && !dupAccount) { // account is fine, so add it
			addAccount(tempUsername, tempPassword, false, function () {});
		} else if (fieldLines[i].indexOf(':') == -1) { // malformed line, so skip this line and all lines after it
			bpAlert("There was a problem parsing line " + (i + 1) + " (" + fieldLines[i] + "). This line and all lines after it have not been parsed.");
			return false;
		} else {
			// do nothing at this time
		}
	}
}

function hideAccountList() {
   document.getElementById('accountinfo').innerHTML = "";
}

function addAccount(username, password, infoNeedsVerification, callbackOnSuccess, callbackOnFailure, callbackOnLogoutFailure) {
	if (infoNeedsVerification) { // account was not "added in bulk"
	 	verifyAccountInfo(username, password, function () { // account successfully verified
	 		var duplicateAccount = false;

	 		// check if this account is already in the list
	 		for (var i = 1; i <= accountCount; i++) {
	 			if (accountUsernames[i] == username) {
	 				duplicateAccount = true;
	 			}
	 		}

	 		if (duplicateAccount) {
	 			bpAlert(username + " is already configured with Bing Pong.");
	 		} else {
	 			// incriment the number of accounts stored in Bing Pong
	 			accountCount++;

	 			// store the new username and password into the internal arrays
	 			accountUsernames[accountCount] = username;
	 			accountPasswords[accountCount] = password;

	 			// store the new username, password, and account count into local storage
	 			bp.cookies.set("username" + accountCount, username);
	 			bp.cookies.set("password" + accountCount, password);
	 			bp.cookies.set("accountCount", accountCount);

	 			// update the account manager display
	 			updateAccountManagerDisplay();

	 			// return to caller
	 			callbackOnSuccess();
	 		}
	 	}, function () { // account failed to verify
	 		// return to caller
	 		callbackOnFailure();
	 	}, function () {
	 		// return to caller
	 		callbackOnLogoutFailure();
		});
	} else { // account was "added in bulk," so do not verify info
		// incriment the number of accounts stored in Bing Pong
	 	accountCount++;

	 	// store the new username and password into the internal arrays
	 	accountUsernames[accountCount] = username;
	 	accountPasswords[accountCount] = password;

	 	// store the new username, password, and account count into local storage
	 	bp.cookies.set("username" + accountCount, username);
	 	bp.cookies.set("password" + accountCount, password);
	 	bp.cookies.set("accountCount", accountCount);

	 	// update the account manager display
	 	updateAccountManagerDisplay();

	 	// return to caller
	 	callbackOnSuccess();
	 }
}

function removeAccount(accountIndex) {
	// delete the corresponding cookies
	bp.cookies.remove("username" + accountIndex);
	bp.cookies.remove("password" + accountIndex);
	bp.cookies.remove("credits" + accountIndex);
	bp.cookies.remove("isRedeemable" + accountIndex);

	// remove account entry #accountIndex from the arrays
	accountUsernames.splice(accountIndex, 1);
	accountPasswords.splice(accountIndex, 1);
	accountCredits.splice(accountIndex, 1);
	accountRedeemStatuses.splice(accountIndex, 1);

	// update the new account count
	accountCount--;
	bp.cookies.set("accountCount", accountCount);

	// shift all accounts > accountIndex down to "fill the gap"
	for (var i = 1; i <= accountCount; i++) {
		bp.cookies.set("username" + i, accountUsernames[i]);
		bp.cookies.set("password" + i, accountPasswords[i]);
		bp.cookies.set("credits" + i, accountCredits[i]);
		bp.cookies.set("isRedeemable" + i, accountRedeemStatuses[i]);
	}

	// delete the cookie corresponding to the (accountCount + 1)th account
	bp.cookies.remove("username" + (accountCount + 1));
	bp.cookies.remove("password" + (accountCount + 1));
	bp.cookies.remove("credits" + (accountCount + 1));
	bp.cookies.remove("isRedeemable" + (accountCount + 1));

	// update the account manager display
	updateAccountManagerDisplay();
}
