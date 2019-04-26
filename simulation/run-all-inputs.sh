#!/usr/bin/env bash

PWD=$(pwd)

for index in $( seq 1 $1);
do
    echo "At run $index"
    sed -i -E "s@(file:\/\/).*(\/simulation\/input\/run)[0-9]+(.txt)@\1$PWD\2$index\3@g" simulation/StakingSimulation.js
    truffle test simulation/StakingSimulation.js 2> simulation/output/run$index.csv 1> simulation/output/run$index.log
done;
