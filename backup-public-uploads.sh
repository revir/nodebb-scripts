#!/bin/bash

nodebbDir=$1
backupsDir=$2
backupName="$backupsDir/nodebb-public-uploads-$(date +%Y-%m-%d).zip"
cd "$nodebbDir/public/uploads"
zip -r $backupName ./*
cd -