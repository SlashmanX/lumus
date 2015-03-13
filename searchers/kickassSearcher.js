var Q = require('q');
var request = require('request');
var cheerio = require('cheerio');
var config = require('../config');
var labels = require('../labels');

var Kickass = require('node-kickass');
var ItemTypes = require('../models/item').ItemTypes;

module.exports.name = 'Kickass Torrents';

config.add('kickassSearcher', { type : 'literal', store : {'searcher:kickassSearcher:use' : true }});
//TODO url
labels.add({ kickassSearcher : module.exports.name });


module.exports.searchFor = function(item) {
	var deferred = Q.defer();
	
	/// node-kickass doesn't encode the query for uri
	var searchTerm = encodeURIComponent(getSearchTerm(item));
	var query = searchTerm + ' category:' + getCategory(item);
	
	new Kickass().setQuery(query).setSort({
		field : "seeders",
		sorder : "desc"
	}).run(function(errors, searchResults) {
		if (errors && errors.length) {
			if (errors[0].message === 'Not a feed') {
				deferred.resolve([]);
			} else {
				deferred.reject(errors);
			}
			return;
		}

		deferred.resolve(searchResults.map(convertDataItemToResult));	
	});
	
	return deferred.promise;
};

var getSearchTerm = function(item) {
	var term;

	if (item.searchTerm) {
		term = item.searchTerm;
	} else  if (item.type === ItemTypes.show) {
		term = item.name + '"season ' + item.no + '" complete';
	} else if (item.year) {
		term = item.name + " " + item.year;
	} else {
		term = item.name;
	}
	
	return term.replace(/-/g, '"-"');
};

var convertDataItemToResult = function(dataItem) {
	var result = {};	
	result.title = dataItem.title;
	result.magnetLink = dataItem['torrent:magneturi']['#'];
	result.torrentInfoUrl = dataItem['link'];
	result.size = parseInt(dataItem['torrent:contentlength']['#']) / 1048576 | 0;
	result.seeds = parseInt(dataItem['torrent:seeds']['#']);
	result.leechs = parseInt(dataItem['torrent:peers']['#']) - result.seeds;
	result.verified = '1' === dataItem['torrent:verified']['#'];
	result.releaseName = dataItem['torrent:filename']['#'].slice(0, -8);
	result.getDescription = function() {
		return getDescription(dataItem.link);
	};
	return result;
};

var getDescription = function(link) {
	var deferred = Q.defer();
	
	request({
		method: 'GET',
    	uri: link,
    	gzip: true
    }, function(error, response, body) {
		if (error) {
			return deferred.reject(error);
		}

		$ = cheerio.load(body);
		var description = $('#desc').text();
		deferred.resolve(description);
	});
	
	return deferred.promise;
}

var getCategory = function(item) {
	if (item.type === ItemTypes.movie) {
		return "highres-movies";
	} else if (item.type === ItemTypes.show) {
		return "tv";
	} else if (item.type === ItemTypes.music) {
		return "music";
	}
};