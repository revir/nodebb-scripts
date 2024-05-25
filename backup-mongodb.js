#! /usr/bin/env node
var nodeCLI = require("shelljs-nodecli");
var fs = require("fs-extra");
var path = require("path");
var moment = require("moment");

console.log("Preparing to backup NodeBB");
var pwd = process.argv[2];
console.log("Present Working Directory: " + pwd);

var dockerName = process.argv[3];
var dbName = process.argv[4];

//---------------------------------------------
//Find and load config.json settings for NodeBB, give warning and exit if not Mongo
//---------------------------------------------

var backupsDir = path.join(pwd, "../backups");
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir);
}
console.log("backupsDir: " + backupsDir);

var configPath = path.join(pwd, "/config.json");
console.log("Loading: " + configPath);

var configContents;
try {
  configContents = fs.readFileSync(configPath, "utf8");
} catch (err) {
  console.log(
    "Unable to load necessary nodebb config.json file: " + configPath
  );
  throw err;
}

var config = JSON.parse(configContents);
if (config.database !== "mongo") {
  throw new Error(
    "Currently this script only works with backing up mongo.  Want to improve it?  https://github.com/jongarrison/nodebb-backup"
  );
}

//---------------------------------------------
//Find and load current NodeBB version name from package.json (like: 0.7.3)
//---------------------------------------------

var packagePath = path.join(pwd, "/package.json");
console.log("Loading: " + packagePath);

var packageContents;
try {
  packageContents = fs.readFileSync(packagePath, "utf8");
} catch (err) {
  console.log(
    "Unable to load necessary nodebb package.json file: " + packagePath
  );
  throw err;
}

var package = JSON.parse(packageContents);

console.log("Found NodeBB version: " + package.version);

//---------------------------------------------
//MongoDump into temp-backup directory
//---------------------------------------------

dbName = dbName || config.mongo.database;
console.log("About to backup db: " + dbName);

if (dockerName) {
  backupsDir = "/backups";
}

var timeString = moment().format("YYYY-MM-DD");
var backupFileName = "db-" + dbName + "-" + timeString + ".gz";

var args = [
  "-v",
  "-d",
  dbName,
  config.mongo.username ? "-u " + config.mongo.username : "",
  config.mongo.password ? "-p " + '"' + config.mongo.password + '"' : "",
  "-h",
  config.mongo.host + ":" + config.mongo.port,
  "--gzip",
  "--archive=" + path.join(backupsDir, backupFileName),
];

if (dockerName) {
  nodeCLI.exec("docker", "exec", dockerName, "mongodump", ...args);
} else {
  nodeCLI.exec("mongodump", ...args);
}
