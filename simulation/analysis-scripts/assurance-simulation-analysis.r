library(dplyr)
library(readr)
library(RColorBrewer)
library(rlist)

## Analysis script inputs
run_index = 24;

## Fixed constants
NUMBER_OF_AGENTS_INDEX = 2;

## Turn warnings off
options(warn = -1)

## Read input and output files for the simulation run
run_in = read_table2(paste("input/run", run_index, ".txt", sep = ""));
run_out = read_csv(paste("output/run", run_index, ".csv", sep = ""));
df = tbl_df(run_out);

## Save plot to PNG, don't display it
png(paste("assurance-simulation-agent-behavior-run", run_index, ".png", sep = ""), width = 810, height = 530);

## Set the canvas
par(mar=c(4, 4, 2, 3))
layout(matrix(list.append(rep_len(1, 15), seq(2, 11)), 5, 5, byrow = TRUE));
plot(1, type="n", 
     xlab="Simulation iterations", 
     ylab="QSPWei", 
     ylim=c(-5.0e+20, 2.0e+21), 
     xlim=c(0, length(df$Tick)),
     xaxt='n');
title(main = paste("Agent Behavior in Assurance Simulation Run#", run_index, sep = ""));
## Define colors for agents
number_of_agents = max(run_in[NUMBER_OF_AGENTS_INDEX,1]);
mycol = brewer.pal(n = number_of_agents*2, name = "Paired")
apply_color = function(x) {
  mycol[x];
}

## Draw vertical grid lines
for (i in seq(0, max(df$Tick), 25)) {
  abline(v = i, col = "#cccccc");
}
axis(side = 1, at = seq(0, max(df$Tick), 25));
legend_list = list();
## Plot the balance and method sequence for each agent
for (i in seq(0, number_of_agents-1)) {
  label = paste("BalanceAgent", i, sep = "");
  legend_list = list.append(legend_list, label);
  balance = unlist(df[, label]);
  method = factor(unlist(df[, paste("Method", i, sep = "")]));
  
  lines(y=balance, x=df$Tick, type="l", lty=i+1, col=mycol[i*2+2]);
  lines(y=rep_len(-1.0e+20*(i+1),
                  length(method)),
        x=df$Tick, type="p",
        col=sapply(as.numeric(method)+i*2, apply_color));
}
legend("topright", legend=legend_list, col=mycol[seq(2, 10, 2)], lty=1:number_of_agents);
par(mar=c(1, 3, 1, 3))
## Plot pie charts for the methods of each agent
for (i in seq(0, number_of_agents-1)) {
  method = factor(unlist(df[, paste("Method", i, sep = "")]));
  t = table(method);
  labels = names(t);
  pie(t, labels, col=mycol[seq(2*i+1, 2*i+length(labels)+1)]);
}
## Plot pie charts for the actions of each agent
for (i in seq(0, number_of_agents-1)) {
  action = factor(unlist(df[, paste("ActionOfAgent", i, sep = "")]));
  t = table(action);
  t = t[0:(length(t)-1)];
  labels = names(t);
  pie(t, labels , col=mycol[as.numeric(labels)+2]);
}
## Save to png file
dev.off()