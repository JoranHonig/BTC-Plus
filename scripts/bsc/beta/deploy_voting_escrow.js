const VotingEscrow = artifacts.require("VotingEscrow");
const VotingEscrowProxy = artifacts.require("VotingEscrowProxy");

const AC = '0xe9c1b8993a8750ae65607ef91ebcde595deb4ec3';

module.exports = async function (callback) {
    try {
        const accounts = await web3.eth.getAccounts();

        console.log('Deploying Voting Escrow...');
        const votingEscrowImpl = await VotingEscrow.new();
        const votingEscrowProxy = await VotingEscrowProxy.new(votingEscrowImpl.address, accounts[1], Buffer.from(''));

        const votingEscrow = await VotingEscrow.at(votingEscrowProxy.address);
        await votingEscrow.initialize(AC, "Voting ACoconut", "vAC", "1.0.0");
        console.log(`Voting Escrow: ${votingEscrow.address}`);

        callback();
    } catch (e) {
        callback(e);
    }
}