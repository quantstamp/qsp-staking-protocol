const BigNumber = require('bignumber.js');

function toQsp(n) {
  return (new BigNumber(n)).mul((new BigNumber(10)).pow(18));
}

function daysToSeconds(n) {
  return (new BigNumber(n)).mul(24).mul(3600);
}

module.exports = {
  paramDefaults: {
    minDeposit: toQsp('5000'),
    pMinDeposit: toQsp('10000'),
    applyStageLength: daysToSeconds('3'),
    pApplyStageLength: daysToSeconds('7'),
    commitStageLength: daysToSeconds('3'),
    pCommitStageLength: daysToSeconds('7'),
    revealStageLength: daysToSeconds('3'),
    pRevealStageLength: daysToSeconds('3'),
    dispensationPct: 100,
    pDispensationPct: 100,
    voteQuorum: 50,
    pVoteQuorum: 66,
    exitTimeDelay: 0,
    exitPeriodLen: 0
  },
  name: "Staking Protocol Registry"
};
