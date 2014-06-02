var request = require('request');
var cheerio = require('cheerio');
var path = require('path');
var url = require('url');
var config = require('../config');
var notifier = require('./notifier');

var Item = require('../models/item').Item;
var ItemTypes = require('../models/item').ItemTypes;
var ItemStates = require('../models/item').ItemStates;

var transmissionSessionId;
var torrentAddTries = 5;

function searchFor(item) {
	console.log("Searching for " + item.name);
	
	var query = encodeURIComponent(item.name) + "%20" + item.year;
	var url = config.movieSearchUrl.replace('${query}', query);

	request(url, function(err, resp, body) {
		console.log(url + " done");

		if (err) {
			console.log(err);
			//TODO done(err); 
			item.stateInfo = err;
			item.state = ItemStates.wanted;
			item.planNextCheck(config.defaultInterval);
			item.save(function(err) {
				if (err)
					console.log(err);
			});
			return;
		}

		$ = cheerio.load(body);					
		fetchBestMovieResult(item, $(".detName"));
	});	
}

function checkFinished(item) {
	var rpc = {};
	rpc.arguments = {};
	rpc.method = 'torrent-get';
	rpc.arguments.ids = [ item.torrentHash ];
	rpc.arguments.fields = [ 'isFinished', 'downloadDir', 'files', 'name' ];
	
	var options = {
		url : 'http://localhost:9091/transmission/rpc',
		method : 'POST',
		json : rpc,
		headers : {
			'X-Transmission-Session-Id' : transmissionSessionId
		}
	};

	console.log(options.url);
	
	request(options, function(error, response, body) {
		console.log(options.url + " done");

		if (error) {
			console.log(error);
			item.planNextCheck(config.defaultInterval);
			item.save(function(err) {});
			return;
		}
		
		if (response.statusCode == 409) {
			transmissionSessionId = response.headers['x-transmission-session-id'];
			tryAgainOrFail(function() { checkFinished(item); }, "Too many tries, getting 409, giving up.");
			return;
		}			

		console.log(body);
		
		if (body.result !== 'success') {
		
			console.log('Not success. What do?'); //TODO
			item.planNextCheck(config.defaultInterval);
		
		} else {
				
			if (body.arguments.torrents.length == 0) {
			
				console.log('Torrent removed.');
				item.state = ItemStates.wanted;
				item.planNextCheck(config.defaultInterval);
						
			} else if (body.arguments.torrents[0].isFinished) {

				var torrentInfo = body.arguments.torrents[0];
				var filesInfo = torrentInfo.files;
				
				var maxLength = 0;
				var maxFileInfo;
				
				for (var i = 0; i < filesInfo.length; i++) {
					var fileInfo = filesInfo[i];
					if (fileInfo.length > maxLength) {
						maxLength = fileInfo.length;
						maxFileInfo = fileInfo;
					}
				}
				
				console.log(torrentInfo);

				var fileDir = path.dirname(maxFileInfo.name);
				var fileName = path.basename(maxFileInfo.name); 

				item.downloadDir = path.join(torrentInfo.downloadDir, fileDir);
				item.mainFile = fileName;				
				
				item.state = ItemStates.downloaded;
				item.planNextCheck(1); /// So that rename goes right on.				

				if (notifier)
					notifier.notifyDownloaded(item);
					
			} else {
				
				console.log(body.arguments.torrents[0].isFinished);
				item.planNextCheck(config.defaultInterval);
				
			}
			
		}
		
		console.log('Check finished for item ' + item.name + ', state: ' + item.state); 
		
		item.save(function(err) {
			if (err)
				console.log(err);
		});	
	});
}

function fetchBestMovieResult(item, $rootElements) {
	if ($rootElements.length == 0) {
		console.log("No result for " + item.name + ", rescheduling (1 day).");
		item.stateInfo = "No result, rescheduled for tommorow."
		item.planNextCheck(24*3600);
		item.save(function(err) {}); //TODO err
		return;
	}
	
	doNext(item, $rootElements, 0);
}

function doNext(item, rootElements, elementIndex) {
	console.log('DoNext ' + elementIndex);

	if (elementIndex >= rootElements.length) {
		console.log('No result matches filters. Rescheduling in 1 day.'); //TODO better log
		item.stateInfo = "No result matched filters, rescheduled for tommorow."
		item.planNextCheck(24*3600);
		item.save(function(err) {}); //TODO log
		return;
	}

	var rootElement = rootElements[elementIndex];	
	var magnetLink = $(rootElement).next().attr('href');
	
	if (item.torrentLinks) {
		console.log('Checking torrent links');
		console.log('Comparing ' + magnetLink);
	
		for (i = 0; i < item.torrentLinks.length; i++) {
			console.log('With ' + item.torrentLinks[i]);

			if (item.torrentLinks[i] === magnetLink) {
				console.log("Torrent already used before, skipping to try next: " + magnetLink);
				doNext(item, rootElements, elementIndex + 1);
				return;
			}
		}
	}
	
	var $descElement = $(rootElement).siblings('font');
	var desc = $descElement.text();
		
	var sizeMatches = desc.match(/([0-9]+[.]?[0-9]*)[^0-9]+(KiB|MiB|GiB)/); //todo rewise
	
	if (sizeMatches == null || sizeMatches.length < 3) {
	 	console.log('Reached size limit'); //TODO better log
		doNext(item, rootElements, elementIndex + 1);
		return;
	}
	 
	console.log("Matches: " + sizeMatches);
	
	var size = parseFloat(sizeMatches[1]);
	
	if (sizeMatches[2] === 'GiB')
		size = size * 1000;
	else if (sizeMatches[2] === 'KiB')
		size = size / 1000;
				
	console.log('Size: ' + size);
		
	if (size > config.movieSizeLimit) {
		console.log('Reached size limit'); //TODO better log
		doNext(item, rootElements, elementIndex + 1);
		return;
	}
	
	var movieSearchUrlParts = url.parse(config.movieSearchUrl);
	var torrentPageUrl = movieSearchUrlParts.protocol + '//' + movieSearchUrlParts.host + $(rootElement).children('.detLink').attr('href');
	console.log(torrentPageUrl);
	
	request(torrentPageUrl, function(error, response, body) {
		console.log(torrentPageUrl + " done");

		if (error) {
			console.log(error);
			return;
		}
		
		$ = cheerio.load(body);					
		var nfo = $('.nfo').text();
		var comments = $('#comments').text().toLowerCase();
		
		var isGoodKeywords = true;
		
		for (var i = 0; i < config.movieRequiredKeywords.length; i++) { 
			isGoodKeywords = nfo.indexOf(config.movieRequiredKeywords[i]) >= 0;
			if (isGoodKeywords)
				break;
		}
		
		var isNotShit = comments.indexOf('shit') < 0 && comments.indexOf('crap') < 0 && comments.indexOf('hardcoded') < 0  && comments.indexOf('hard coded') < 0; 				
				
		if (isGoodKeywords && isNotShit) {
			addTorrent(item, url, magnetLink);
		} else {	
			doNext(item, rootElements, elementIndex + 1);
		}
	});
}

function addTorrent(item, infoUrl, magnetLink) {	
	var rpc = {};
	rpc.arguments = {};
	rpc.method = 'torrent-add';
	rpc.arguments.filename = magnetLink;
	
	var options = {
		url : 'http://localhost:9091/transmission/rpc',
		method : 'POST',
		json : rpc,
		headers : {
			'X-Transmission-Session-Id' : transmissionSessionId
		}
	};

	console.log(options.url);
	
	request(options, function(error, response, body) {
		console.log(options.url + " done");

		if (error) {
			console.log(error);
			tryAgainOrFail(function() { addTorrent(item, infoUrl, magnetLink); }, "Too many tries, getting error, giving up.");
			return;
		}
		
		if (response.statusCode == 409) {
			transmissionSessionId = response.headers['x-transmission-session-id'];
			tryAgainOrFail(function() { addTorrent(item, infoUrl, magnetLink); }, "Too many tries, getting 409, giving up.");
			return;
		}			

		console.log(body);

		item.planNextCheck(config.defaultInterval);

		if (body.result === 'success') {
			item.stateInfo = null;
			item.state = ItemStates.snatched;
			item.torrentHash = body.arguments['torrent-added'].hashString;
			item.torrentInfoUrl = infoUrl;
			
			if (!item.torrentLinks)
				item.torrentLinks = [];
				
			item.torrentLinks.push(magnetLink);
			
			if (notifier)
				notifier.notifySnatched(item);
				
			console.log('Success. Torrent hash ' + item.torrentHash + '.');
		} else {
			item.stateInfo = "Unable to add to transmission."
			console.log('No success. Sorry. Transmission down or what?');
		}
			
		item.save(function(err) {
			if (err)
				console.log(err);
		});
	});
}

function tryAgainOrFail(doWhat, message) {
	torrentAddTries--;
	
	if (torrentAddTries >= 0) {
		doWhat();
	} else {
		console.log(message);
		return;
	}
}

module.exports.searchFor = searchFor;
