var exif = require('exif2');
var walk = require('walk');
var elasticsearch = require('elasticsearch');
var readline = require('readline');
var moment = require('moment');

var options = {
    listeners: {
      names: function (root, nodeNamesArray) {
        nodeNamesArray.sort(function (a, b) {
          if (a > b) return 1;
          if (a < b) return -1;
          return 0;
        });
      }
    , directories: function (root, dirStatsArray, next) {
        // dirStatsArray is an array of `stat` objects with the additional attributes 
        // * type
        // * error
        // * name
        next();
      }
    , file: function (root, stat, next) {
	console.log("Walk " + stat.name);
	// Add this file to the list of files
	if (strEndsWith(stat.name.toLowerCase(),".jpg")) {
		extractData(root + '/' + stat.name, next);
	}
	next();
      }
    , errors: function (root, nodeStatsArray, next) {
	console.log(nodeStatsArray);
        next();
      }
    }
    , followLinks: true
  };

var walker  = walk.walkSync('/home/friedreb/photo', options);

var client = new elasticsearch.Client({
	host: 'localhost:9200',
	log:'trace'
});

function strEndsWith(str, suffix) {
    return str.match(suffix+"$")==suffix;
}

function extractData(file) {
	console.log("Extracting data");
	exif(file, function(err, obj){
		if(err) {
			console.log("ERROR extracting");
			console.log(err);
			callback();
		} else {
			console.log("Creating the object");
			console.log(obj);
			var searchObj = {};
			searchObj.name = obj["file name"];
			searchObj.camera = obj["camera model name"];
			searchObj.lens = obj["lens"];
			searchObj.iso = obj["iso"];
			searchObj.exposure = obj["exposure time"];
			searchObj.aperture = obj["f number"];
			searchObj.shutter = obj["shutter speed value"];
			searchObj.compensation = obj["exposure compensation"];
			searchObj.focalLength = obj["focal length"];
			if (obj["date time original"] == null) {
				//2016:04:20 18:48:35+02:00
				var momentDate = moment(obj["file modification date time"], 'YYYY:MM:DD HH:mm:ss+ZZ');
				console.log(momentDate);
				searchObj.createDate = momentDate.format("YYYY:MM:DD HH:mm:ss");
			} else {
				var momentDate = moment(obj["date time original"], 'YYYY:MM:DD HH:mm:ss.ms');
				console.log(momentDate);
				searchObj.createDate = momentDate.format("YYYY:MM:DD HH:mm:ss");
			}


			sendToElasticsearch(searchObj);
		}
	});	
}

var items = [];
function sendToElasticsearch(searchObj) {
	console.log("Sending to elastic");
	items.push({"index":{}});
	items.push(searchObj);
	if (items.length >= 1) {
		flushItems();
	}
}

function flushItems() {
	console.log("Flushing items");
	client.bulk({
		index: 'myimages',
		type: 'local',
		body: items
	}, function(err,response) {
		if (err) {
			console.log(err);
		}
		items = [];
	});
}
