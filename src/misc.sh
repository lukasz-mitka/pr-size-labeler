#!/usr/bin/env bash

echoerr() {
	echo "$@" 1>&2
}

log::message() {
	echo "$@"
}

coll::map() {
	local -r fn="$1"
	local input item
	input=$(cat)

	for item in $input; do
		"$fn" "$item"
	done
}

jq::base64() {
	echo "$1" | base64 -d | jq -r "$2"
}
