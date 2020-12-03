#! /usr/bin/env node
var nodeCLI = require('shelljs-nodecli');
var fs = require('fs-extra');
var archiver = require('archiver');
var path = require('path');
var moment = require('moment');

console.log('Preparing to backup NodeBB');
var pwd = process.argv[2];
console.log("Present Working Directory: " + pwd);

var dockerName = process.argv[3];

//---------------------------------------------
//Find and load config.json settings for NodeBB, give warning and exit if not Mongo
//---------------------------------------------


var configPath = path.join(pwd, "/config.json");
console.log("Loading: " + configPath);

var configContents;
try {
  configContents = fs.readFileSync(configPath, 'utf8');
} catch (err) {
    console.log("Unable to load necessary nodebb config.json file: " + configPath);
    throw err;
}

var config = JSON.parse(configContents);
if (config.database !== "mongo") {
  throw new Error("Currently this script only works with backing up mongo.  Want to improve it?  https://github.com/jongarrison/nodebb-backup")
}

console.log("Found db config info for: " + config.mongo.database);


//---------------------------------------------
//Find and load current NodeBB version name from package.json (like: 0.7.3)
//---------------------------------------------


var packagePath = path.join(pwd, "/package.json");
console.log("Loading: " + packagePath);

var packageContents;
try {
  packageContents = fs.readFileSync(packagePath, 'utf8');
} catch (err) {
  console.log("Unable to load necessary nodebb package.json file: " + packagePath);
  throw err;
}

var package = JSON.parse(packageContents);

console.log("Found NodeBB version: " + package.version);


//---------------------------------------------
//Create temp-backup directory to load back up files into
//---------------------------------------------


var tempBackupDir = path.join(pwd, "/temp-backup");
console.log("creating temp backup directory at: " + tempBackupDir);
try {
  if (fs.existsSync(tempBackupDir)) {
    //try to clean it up
    fs.removeSync(tempBackupDir);
    if (fs.existsSync(tempBackupDir)) { throw new Error("Unable to remove dir"); }
  }
} catch (err) {
  console.log("Unable to continue.  Dirty backup dir already exists at: " + tempBackupDir + "\n" + err);
  process.exit(1);
}

fs.mkdirSync(tempBackupDir);

//---------------------------------------------
//MongoDump into temp-backup directory
//---------------------------------------------


console.log("About to backup db: " + config.mongo.database);

nodeCLI.exec(
    dockerName ? 'docker exec -it ' + dockerName + ' mongodump' : 'mongodump',
    '-v',
    '-d', config.mongo.database,
    config.mongo.username ? '-u '+config.mongo.username : '',
    config.mongo.password ? '-p '+'"'+config.mongo.password+'"' : '',
    '-o', tempBackupDir,
    '-h', config.mongo.host + ":" + config.mongo.port
);

//---------------------------------------------
//Now zip them up, give them a reasonable name and move the whole thing up one directory to get out of this git repo
//---------------------------------------------


var timeString = moment().format("YYYY-MM-DD");
var backupFileName = "nodebb-db-" + config.mongo.database + '-' + timeString + '.zip';
var outputFilePath = path.join(pwd, "..", backupFileName);
var output = fs.createWriteStream(outputFilePath);
var archive = archiver('zip');

console.log("Creating compressed backup file: " + outputFilePath);

archive.on('error', function(err){
    throw err;
});
archive.pipe(output);
archive.directory(tempBackupDir, 'db/');
archive.finalize();

output.on('close', function() {
  var len = (archive.pointer() / 1024) / 1024;
  console.log(len + ' MB');
  fs.remove(tempBackupDir);
  console.log("Done and cleaned up");
});
