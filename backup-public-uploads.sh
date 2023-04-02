#!/bin/bash

nodebbDir=$1
backupName="$(dirname $nodebbDir)/nodebb-public-uploads-$(date +%Y-%m-%d).zip"
cd "$nodebbDir/public/uploads"
zip -r $backupName ./*
cd -
