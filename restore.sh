#!/bin/bash
#
# Download NodeBB backups from the remote server and restore them locally.
# Server and database settings are read from restore.env (see restore.env.example).

set -euo pipefail

scriptDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
configFile="${RESTORE_CONFIG:-$scriptDir/restore.env}"

usage()
{
    cat <<EOF
Usage: bash restore.sh [targets...] [options]

Targets:
  --all                 restore everything below
  --nodebb              restore the nodebb mongo database
  --cats-love-youtube   restore the cats-love-youtube mongo database
  --public-uploads      restore nodebb public/uploads

Options:
  --backup              ssh to the server and create fresh backups of the
                        selected targets before downloading them
  --date YYYY-MM-DD     backup date to restore (default: today)
  --download-only       only download the backup files, don't restore
  -h, --help            show this help

Config is read from $configFile
(override with RESTORE_CONFIG=/path/to/file).
EOF
}

if [[ ! -f $configFile ]]; then
    echo "Config file not found: $configFile"
    echo "Copy restore.env.example to restore.env and fill in your settings."
    exit 1
fi
# shellcheck source=/dev/null
source "$configFile"

: "${REMOTE_HOST:?REMOTE_HOST is not set in $configFile}"
: "${REMOTE_USER:?REMOTE_USER is not set in $configFile}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_BACKUPS_DIR="${REMOTE_BACKUPS_DIR:-backups}"
LOCAL_BACKUPS_DIR="${LOCAL_BACKUPS_DIR:-$HOME/backups}"
NODEBB_DIR="${NODEBB_DIR:-$HOME/workspace/NodeBB}"
MONGO_HOST="${MONGO_HOST:-localhost:27017}"
MONGO_USER="${MONGO_USER:-}"
MONGO_PASS="${MONGO_PASS:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-nodebb}"
# used by --backup; ~ is kept literal so it expands on the remote server
REMOTE_NODEBB_DIR="${REMOTE_NODEBB_DIR:-~/pnlpal/NodeBB}"
REMOTE_SCRIPTS_DIR="${REMOTE_SCRIPTS_DIR:-~/pnlpal/nodebb-scripts}"
REMOTE_MONGO_CONTAINER="${REMOTE_MONGO_CONTAINER:-mongo}"

doNodebb=false
doCats=false
doUploads=false
downloadOnly=false
doBackup=false
backupDate="$(date +%Y-%m-%d)"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all)               doNodebb=true; doCats=true; doUploads=true ;;
        --nodebb)            doNodebb=true ;;
        --cats-love-youtube) doCats=true ;;
        --public-uploads)    doUploads=true ;;
        --download-only)     downloadOnly=true ;;
        --backup)            doBackup=true ;;
        --date)
            backupDate="${2:-}"
            if [[ ! $backupDate =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                echo "--date expects YYYY-MM-DD, got: '$backupDate'"
                exit 1
            fi
            shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
done

if ! $doNodebb && ! $doCats && ! $doUploads; then
    usage
    exit 1
fi

mkdir -p "$LOCAL_BACKUPS_DIR"

# run_remote_backup: create fresh backups of the selected targets on the server
run_remote_backup()
{
    local cmds=()
    if $doNodebb; then
        cmds+=("/home/river/.nvm/versions/node/v18.20.3/bin/node $REMOTE_SCRIPTS_DIR/backup-mongodb.js $REMOTE_NODEBB_DIR $REMOTE_MONGO_CONTAINER nodebb")
    fi
    if $doCats; then
        cmds+=("/home/river/.nvm/versions/node/v18.20.3/bin/node $REMOTE_SCRIPTS_DIR/backup-mongodb.js $REMOTE_NODEBB_DIR $REMOTE_MONGO_CONTAINER cats-love-youtube")
    fi
    if $doUploads; then
        cmds+=("bash $REMOTE_SCRIPTS_DIR/backup-public-uploads.sh $REMOTE_NODEBB_DIR $REMOTE_BACKUPS_DIR")
    fi
    local remoteCmd
    remoteCmd="set -e; $(printf '%s; ' "${cmds[@]}")"
    echo "### backup on $REMOTE_HOST"
    ssh -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" "$remoteCmd"
}

# download <file name>: fetch a backup from the remote backups dir into LOCAL_BACKUPS_DIR
download()
{
    local name=$1
    local dest="$LOCAL_BACKUPS_DIR/$name"
    echo "### download $name"
    # download to a temp file first so an interrupted scp never leaves a partial backup behind
    scp -P "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKUPS_DIR/$name" "$dest.part"
    mv "$dest.part" "$dest"
}

mongo_uri()
{
    local db=$1
    local auth=""
    if [[ -n $MONGO_USER ]]; then
        auth="$MONGO_USER:$MONGO_PASS@"
    fi
    echo "mongodb://$auth$MONGO_HOST/$db?authSource=$MONGO_AUTH_DB"
}

# restore_db <db name>: download db-<name>-<date>.gz and mongorestore it into <db name>
restore_db()
{
    local db=$1
    local name="db-$db-$backupDate.gz"
    download "$name"
    if $downloadOnly; then
        return
    fi
    echo "### mongorestore $db"
    mongorestore --uri "$(mongo_uri "$db")" --drop --gzip --archive="$LOCAL_BACKUPS_DIR/$name"
}

restore_uploads()
{
    local name="nodebb-public-uploads-$backupDate.zip"
    download "$name"
    if $downloadOnly; then
        return
    fi
    local uploadsDir="$NODEBB_DIR/public/uploads"
    echo "### unzip $name to $uploadsDir"
    mkdir -p "$uploadsDir"
    # the backup zips the contents of public/uploads, so extract straight into it
    unzip -o -q "$LOCAL_BACKUPS_DIR/$name" -d "$uploadsDir"
}

if $doBackup; then
    run_remote_backup
fi
if $doNodebb; then
    restore_db nodebb
fi
if $doCats; then
    restore_db cats-love-youtube
fi
if $doUploads; then
    restore_uploads
fi

echo "### done"
