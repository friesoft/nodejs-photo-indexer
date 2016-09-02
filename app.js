var exif = require('exif2');
var chokidar = require('chokidar');
var elasticsearch = require('elasticsearch');
var readline = require('readline');
var moment = require('moment');


// Initialize watcher. 
var watcher = chokidar.watch('/home/friedreb/photo', {
  persistent: true,
  ignoreInitial: true
});
 
// Something to use when events are received. 
var log = console.log.bind(console);
// Add event listeners. 
watcher
  .on('add', path => {
	log(`File ${path} has been added`);
	if (strEndsWith(path.toLowerCase(),".jpg")) {
		extractData(path);
	}
     }
   )
  .on('change', path => log(`File ${path} has been changed`))
  .on('unlink', path => log(`File ${path} has been removed`));
 
// More possible events.
watcher
  .on('addDir', path => log(`Directory ${path} has been added`))
  .on('unlinkDir', path => log(`Directory ${path} has been removed`))
  .on('error', error => log(`Watcher error: ${error}`))
  .on('ready', () => log('Initial scan complete. Ready for changes'))
  .on('raw', (event, path, details) => {
    log('Raw event info:', event, path, details);
  });
 
// 'add', 'addDir' and 'change' events also receive stat() results as second 
// argument when available: http://nodejs.org/api/fs.html#fs_class_fs_stats 
watcher.on('change', (path, stats) => {
  if (stats) console.log(`File ${path} changed size to ${stats.size}`);
});

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
			searchObj.directory = obj["directory"];
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
