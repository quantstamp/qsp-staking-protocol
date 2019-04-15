#!/usr/bin/env bash

set -e
truffle test &
pid2=`echo $!`
ethereum-bridge -H localhost:7545 -a 1 > /dev/null &
pid1=`echo $!` 
while [ -d /proc/$pid2 ] ; do
    sleep 5
done && kill -9 $pid1
