var ItemTypes = Object.freeze({film:"film", serie:"serie", music:"music"});
var ItemStates = Object.freeze({wanted:"wanted", snatched:"snatched", downloaded:"downloaded", renamed:"renamed", subtitled:"subtitled"});

var Datastore = require('nedb');

db = {};
db.items = new Datastore("items.db");

db.items.loadDatabase();

function Item() {
	this.name = null;
	this.type = null;
	this.state = ItemStates.wanted;
	this.lastCheck = new Date().toJSON();
	this.nextCheck = new Date(new Date().getTime() + 10000).toJSON(); //TODO hardcoded
	
	Item.setupMethods(this);
}

Item.setupMethods = function(item) {
	item.save = function(done) {
		if (!done)
			throw "Sorry, done callback is required.";
		
		console.log('s');
		if (item._id) {
			db.items.update({_id : item._id}, item, {}, done);
		} else {
			console.log('i');
			db.items.insert(item, function(err, newDoc) {
				console.log(err);
				item._id = newDoc._id;
				done(err);
			});
		}
	};
	
	item.planNextCheck = function(seconds) {
		item.nextCheck = new Date(new Date().getTime() + seconds * 1000).toJSON();		
	}
};

Item.getAll = function(done) {
	console.log('0');
	db.items.find({}, function(err, items) {
		if (err) {
			console.log(err);
			done(err, null);
		}
		
		for (index in items) {
			var item = items[index];
			Item.setupMethods(item);
		}

		done(null, items);
	});
};

Item.findOne = function(what, done) {
	db.items.findOne(what, function(err, item) {
		if (item)
			Item.setupMethods(item);
		
		done(err, item);
	});
};

Item.find = function(byWhat, done) {
	db.items.find(byWhat, function(err, items) {
		if (err) {
			console.log(err);
			done(err, null);
		}
		
		for (index in items) {
			var item = items[index];
			console.log('setting up item ' + item);
			Item.setupMethods(item);
		}

		done(null, items);
	});
};

Item.findById = function(id, done) {
	Item.findOne({_id : id}, done);
};


module.exports.Item = Item;
module.exports.ItemTypes = ItemTypes;
module.exports.ItemStates = ItemStates;