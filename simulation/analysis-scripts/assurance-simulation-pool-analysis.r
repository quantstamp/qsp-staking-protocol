library(dplyr)
library(readr)
library(RColorBrewer)
library(rlist)

## Analysis script inputs
#run_index = 3;
plot_ticks = 25;

## Fixed constants
NUMBER_OF_POOLS_INDEX = 3;

## Turn warnings off
options(warn = -1)

for (run_index in 1:24) {
## Read input and output files for the simulation run
run_in = read_table2(paste("input/run", run_index, ".txt", sep = ""));
run_out = read_table2(paste("output/run", run_index, ".csv", sep = ""));
df = tbl_df(run_out);
number_of_pools = max(run_in[NUMBER_OF_POOLS_INDEX,1]);

## Save plot to PNG, don't display it
png(paste("assurance-simulation-pool-analysis-full-run", run_index, ".png", sep = ""), width = 810, height = 530);

## Set the canvas
par(mar=c(4, 4, 1, 2))
layout(matrix(c(1, 2, 3), 3, 1, byrow = TRUE));
plot(1, type="n", 
     xlab="Simulation iterations", 
     ylab="Deposit QSPWei", 
     ylim=c(0, 2.1e+22), 
     xlim=c(0, length(df$Tick)),
     xaxt='n');
title(main = paste("Pool Dynamics in Assurance Simulation Run#", run_index, sep = ""));
## Draw vertical grid lines
for (i in seq(0, max(df$Tick), plot_ticks)) {
  abline(v = i, col = "#cccccc");
}
axis(side = 1, at = seq(0, max(df$Tick), plot_ticks));
legend_list = list();
## Plot pool deposit
for (i in seq(0, number_of_pools-1)) {
  label = paste("DepositQspWei", i, sep = "");
  legend_list = list.append(legend_list, label);
  deposit = unlist(df[, label]);
  
  lines(y=deposit, x=df$Tick, type="l", lty=i+1, col=i+1);
}
legend("topright", legend=legend_list, col=1:number_of_pools, lty=1:number_of_pools);

## Plot pool stakes size
plot(1, type="n", 
     xlab="Simulation iterations", 
     ylab="Pool Size QSPWei (Log)", 
     ylim=c(1e+20, 2.1e+25), 
     xlim=c(0, length(df$Tick)),
     xaxt='n',
     log='y');
## Draw vertical grid lines
for (i in seq(0, max(df$Tick), plot_ticks)) {
  abline(v = i, col = "#cccccc");
}
axis(side = 1, at = seq(0, max(df$Tick), plot_ticks));
legend_list = list();
for (i in seq(0, number_of_pools-1)) {
  label = paste("PoolSizeQspWei", i, sep = "");
  legend_list = list.append(legend_list, label);
  pool_size = unlist(df[, label]);
  
  lines(y=pool_size, x=df$Tick, type="l", lty=i+1, col=i+1);
}
legend("topright", legend=legend_list, col=1:number_of_pools, lty=1:number_of_pools);

## plot stake count
par(mar=c(2, 4, 0, 2));
legend_list = list();
plot(1, type="n", 
     xlab="", 
     ylab="Stake Count", 
     ylim=c(0, 50), 
     xlim=c(0, length(df$Tick)));
## Draw vertical grid lines
for (i in seq(0, max(df$Tick), plot_ticks)) {
  abline(v = i, col = "#cccccc");
}
for (i in seq(0, 50, 10)) {
  abline(h = i, col = "#cccccc");
}
for (i in seq(0, number_of_pools-1)) {
  label = paste("StakeCount", i, sep = "");
  legend_list = list.append(legend_list, label);
  stake_count = unlist(df[, label]);
  method = factor(unlist(df[, paste("PoolState", i, sep = "")]));
  
  lines(y=stake_count, x=df$Tick, type="l", lty=i+1, col=i+1);
}
axis(side = 1, at = seq(0, max(df$Tick), plot_ticks));
axis(side = 2, at = seq(0, 50, 10));
legend("topright", legend=legend_list, col=1:number_of_pools, lty=1:number_of_pools);

# Plot pool states
for (i in seq(0, number_of_pools-1)) {
  pool_state = unlist(df[, paste("PoolState", i, sep="")]);
  pool_labels = c(pool_state[[1]]);
  pool_ticks = c(1);
  for (j in 2:length(df$Tick)) {
    if (pool_state[[j]] != pool_state[[j-1]]) {
      pool_labels = append(pool_labels, c(pool_state[[j]]));
      pool_ticks = append(pool_ticks, c(j));
    }
  }
  text(pool_ticks, rep_len(i*4, length(pool_state)), labels=pool_labels, cex= 1.2, col=i+1);
}
## Save to png file
dev.off()
}