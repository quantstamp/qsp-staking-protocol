#!/usr/bin/env bash

set -e
ethereum-bridge -H localhost:7545 -a 1 > /dev/null &
bridge_pid=`echo $!`
truffle test
kill -9 $bridge_pid
