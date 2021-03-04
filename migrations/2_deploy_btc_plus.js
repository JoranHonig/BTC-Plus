const BTCPlus = artifacts.require("BTCPlus");
const PlusProxy = artifacts.require("PlusProxy");

const deployBTCPlus = async (deployer, accounts) => {
    const btcPlus = await deployer.deploy(BTCPlus);
    const btcPlusProxy = await deployer.deploy(PlusProxy, btcPlus.address, accounts[1], Buffer.from(''));
    const proxiedBtcPlus = await BTCPlus.at(btcPlusProxy.address);

    await proxiedBtcPlus.initialize();
}

module.exports = function (deployer, network, accounts) {
    deployer
        .then(() => deployBTCPlus(deployer, accounts))
        .catch(error => {
            console.log(error);
            process.exit(1);
        });
};
