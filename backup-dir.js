#! /usr/bin/env node
var fs = require("fs-extra");
var archiver = require("archiver");
var path = require("path");
var moment = require("moment");

console.log("Preparing to backup NodeBB");
var pwd = process.argv[2];
console.log("Present Working Directory: " + pwd);

if (!fs.existsSync(pwd + "/config.json")) {
  throw "ERROR " + pwd + " is not nodebb directory!";
}

var timeString = moment().format("YYYY-MM-DD");
var backupFileName = "nodebb-dir-" + timeString + ".zip";
var outputFilePath = path.join(pwd, "../backups", backupFileName);
var output = fs.createWriteStream(outputFilePath);
var archive = archiver("zip");

console.log("Creating compressed backup file: " + outputFilePath);

archive.on("error", function (err) {
  throw err;
});
archive.pipe(output);
archive.directory(pwd, "dir/");
archive.finalize();

output.on("close", function () {
  var len = archive.pointer() / 1024 / 1024;
  console.log(len + " MB");
  console.log("Done and cleaned up");
});
