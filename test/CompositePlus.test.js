const { expectRevert, BN } = require('@openzeppelin/test-helpers');
const assert = require('assert');
const SinglePlus = artifacts.require("SinglePlus");
const CompositePlus = artifacts.require("CompositePlus");
const MockToken = artifacts.require("MockToken");
const MockStrategy = artifacts.require("MockStrategy");

const MAX = web3.utils.toBN(2).pow(web3.utils.toBN(256)).sub(web3.utils.toBN(1));
const assertAlmostEqual = function(expectedOrig, actualOrig) {
    const _1e18 = new BN('10').pow(new BN('18'));
    const expected = new BN(expectedOrig).div(_1e18).toNumber();
    const actual = new BN(actualOrig).div(_1e18).toNumber();

    assert.ok(Math.abs(expected - actual) <= 2, `Expected ${expected}, actual ${actual}`);
}
const toWei = web3.utils.toWei;

contract("CompositePlus", async ([owner, treasury, strategist, user1, user2, user3, composite2]) => {
    let composite;
    let token1, token2, token3;
    let plus1, plus2, plus3;
    let strategy1, strategy2, strategy3;

    beforeEach(async () => {
        composite = await CompositePlus.new();
        await composite.initialize("Mock Composite", "mComposite");
        await composite.setTreasury(treasury);
        await composite.setStrategist(strategist, true);

        token1 = await MockToken.new("Mock 1", "Mock 1", 6);
        plus1 = await SinglePlus.new();
        await plus1.initialize(token1.address, '', '');
        strategy1 = await MockStrategy.new();
        await strategy1.initialize(plus1.address);
        await plus1.approveStrategy(strategy1.address, true);

        token2 = await MockToken.new("Mock 2", "Mock 2", 18);
        plus2 = await SinglePlus.new();
        await plus2.initialize(token2.address, '', '');
        strategy2 = await MockStrategy.new();
        await strategy2.initialize(plus2.address);
        await plus2.approveStrategy(strategy2.address, true);

        token3 = await MockToken.new("Mock 3", "Mock 3", 8);
        plus3 = await SinglePlus.new();
        await plus3.initialize(token3.address, '', '');
        strategy3 = await MockStrategy.new();
        await strategy3.initialize(plus3.address);
        await plus3.approveStrategy(strategy3.address, true);

        await composite.addToken(plus1.address);
        await composite.addToken(plus2.address)
    });

    it("should allow governance to add rebalancer", async () => {
        await expectRevert(composite.addRebalancer(user2, {from: strategist}), "not governance");
        await composite.addRebalancer(user2);
        assert.strictEqual(await composite.rebalancers(user2), true);
    });
    
    it("should allow governance to update min liquidity ratio", async () => {
        await expectRevert(composite.setMinLiquidityRatio("9990", {from: strategist}), "not governance");
        await composite.setMinLiquidityRatio("9990");
        assert.strictEqual((await composite.minLiquidityRatio()).toString(), "9990");
    });

    it("should allow governance to add token", async () => {
        assert.strictEqual(await composite.tokenSupported(plus1.address), true);
        assert.strictEqual(await composite.tokens(0), plus1.address);
        assert.strictEqual(await composite.tokenSupported(plus2.address), true);
        assert.strictEqual(await composite.tokens(1), plus2.address);
        assert.strictEqual(await composite.tokenSupported(plus3.address), false);

        await expectRevert(composite.addToken(plus3.address, {from: strategist}), "not governance");
        await expectRevert(composite.addToken(plus2.address), "token exist");
        await composite.addToken(plus3.address);
        assert.strictEqual(await composite.tokenSupported(plus3.address), true);
        assert.strictEqual(await composite.tokens(2), plus3.address);

        await expectRevert(composite.addToken(plus3.address), "token exist");
    });

    it("should allow governance to remove token", async () => {
        await expectRevert(composite.removeToken(plus2.address, {from: strategist}), "not governance");
        await expectRevert(composite.removeToken(plus3.address), "token not exists");

        await composite.addToken(plus3.address);

        // Removes the first pool
        await composite.removeToken(plus1.address);
        assert.strictEqual(await composite.tokenSupported(plus1.address), false);
        // Token 3 is moved from index 2 to index 0!
        // Token 2 is unchanged!
        assert.strictEqual(await composite.tokens(0), plus3.address);
        assert.strictEqual(await composite.tokens(1), plus2.address);

        // Removes the last pool
        await composite.removeToken(plus3.address);
        assert.strictEqual(await composite.tokenSupported(plus3.address), false);
        assert.strictEqual(await composite.tokens(0), plus2.address);
    });

    it("should not allow to remove pool if its balance is non zero", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        await expectRevert(composite.removeToken(plus2.address), "nonzero balance");
        await composite.redeem(MAX, {from: user1});
        await composite.removeToken(plus2.address);
    });

    it("should be able to mint", async () => {
        assert.strictEqual((await composite.balanceOf(user1)).toString(), "0");
        assert.strictEqual((await composite.totalSupply()).toString(), "0");

        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        assert.strictEqual((await composite.index()).toString(), toWei("1"));
        assert.strictEqual((await composite.balanceOf(user1)).toString(), toWei("50"));
        assert.strictEqual((await composite.totalSupply()).toString(), toWei("50"));
        assert.strictEqual((await composite.userShare(user1)).toString(), toWei("50"));
        assert.strictEqual((await composite.totalShares()).toString(), toWei("50"));

        assert.strictEqual((await token1.balanceOf(user1)).toString(), "0");
        assert.strictEqual((await token2.balanceOf(user1)).toString(), "0");
    });

    it("should return the correct mint amount", async () => {
        const mintAmount1 = await composite.getMintAmount([plus1.address, plus2.address], [toWei("20"), toWei("30")]);
        const mintAmount2 = await composite.getMintAmount([plus2.address, plus1.address], [toWei("30"), toWei("20")]);

        assert.strictEqual(mintAmount1.toString(), toWei("50"));
        assert.strictEqual(mintAmount2.toString(), toWei("50"));
    });

    it("should rebase after harvest", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 6 token2(30 * 20%)
        await plus2.harvest();

        assert.strictEqual((await composite.index()).toString(), toWei("1"));
        assert.strictEqual((await composite.balanceOf(user1)).toString(), toWei("50"));
        assert.strictEqual((await composite.totalSupply()).toString(), toWei("50"));
        assert.strictEqual((await composite.userShare(user1)).toString(), toWei("50"));
        assert.strictEqual((await composite.totalShares()).toString(), toWei("50"));

        await composite.rebase();

        assert.strictEqual((await composite.index()).toString(), toWei("1.12"));
        assert.strictEqual((await composite.balanceOf(user1)).toString(), toWei("56"));
        assert.strictEqual((await composite.totalSupply()).toString(), toWei("56"));
        assert.strictEqual((await composite.userShare(user1)).toString(), toWei("50"));
        assert.strictEqual((await composite.totalShares()).toString(), toWei("50"));
    });

    it("should mint after rebase", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 6 token2(30 * 20%)
        await plus2.harvest();
        await composite.rebase();

        // Mint 5.6 token2 to user2
        await token2.mint(user2, toWei("5.6"));
        // Mint 5.6 plus2 to user2
        await token2.approve(plus2.address, toWei("5.6"), {from: user2});
        await plus2.mint(toWei("5.6"), {from: user2});
        // Mint 5.6 BTC+ to user2
        await plus2.approve(composite.address, toWei("5.6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("5.6"), 0], {from: user2});

        assert.strictEqual((await composite.index()).toString(), toWei("1.12"));
        assertAlmostEqual((await composite.balanceOf(user2)).toString(), toWei("5.6")); 
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("61.6"));
        assertAlmostEqual((await composite.userShare(user2)).toString(), toWei("5"));
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("55"));
    }); 

    it("should return the correct mint amount after rebase", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 6 token2(30 * 20%)
        await plus2.harvest();
        await composite.rebase();

        // Mint 5.6 BTC+ to user2
        const mintAmount = await composite.getMintAmount([plus2.address, plus1.address], [toWei("5.6"), 0]);
        assertAlmostEqual(mintAmount.toString(), toWei("5.6"));
    }); 

    it("should redeem BTC+", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        assertAlmostEqual((await composite.index()).toString(), toWei("1.2"));
        assertAlmostEqual((await composite.balanceOf(user2)).toString(), toWei("6"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("66"));
        assertAlmostEqual((await composite.userShare(user2)).toString(), toWei("5"));
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("55"));
        assert.strictEqual((await plus1.balanceOf(user2)).toString(), "0");
        assert.strictEqual((await plus2.balanceOf(user2)).toString(), "0");

        // Redeems 2.4 BTC+ from user2
        await composite.redeem(toWei("2.4"), {from: user2});
        assertAlmostEqual((await composite.index()).toString(), toWei("1.2"));
        assertAlmostEqual((await composite.balanceOf(user2)).toString(), toWei("3.6"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("63.6"));
        assertAlmostEqual((await composite.userShare(user2)).toString(), toWei("3"));
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("53"));

        // User2 should get 0.8 plus1 and 1.6 plus2
        assertAlmostEqual((await plus1.balanceOf(user2)).toString(), toWei("0.8"));
        assertAlmostEqual((await plus2.balanceOf(user2)).toString(), toWei("1.6"));
    });

    it("should return the correct redeem amount", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        // Redeems 2.4 BTC+ from user2
        const result = await composite.getRedeemAmount(toWei("2.4"));
        assert.deepStrictEqual(result[0], [plus1.address, plus2.address]);
        assertAlmostEqual(result[1][0].toString(), toWei("0.8"));
        assertAlmostEqual(result[1][1].toString(), toWei("1.6"));
        assertAlmostEqual(result[2].toString(), toWei("2"));
        assert.strictEqual(result[3].toString(), "0");
    });

    it("should redeem all BTC+", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        // Redeems all BTC+ from user2
        await composite.redeem(MAX, {from: user2});
        assertAlmostEqual((await composite.index()).toString(), toWei("1.2"));
        assert.strictEqual((await composite.balanceOf(user2)).toString(), toWei("0"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("60"));
        assert.strictEqual((await composite.userShare(user2)).toString(), toWei("0"));
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("50"));

        // User2 should get 2 plus1 and 4 plus2
        assertAlmostEqual((await plus1.balanceOf(user2)).toString(), toWei("2"));
        assertAlmostEqual((await plus2.balanceOf(user2)).toString(), toWei("4"));
    });

    it("should redeem BTC+ with fee", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        // Set redeem fee to 1%
        await composite.setRedeemFee(100);

        // Redeems 2.4 BTC+ from user2
        await composite.redeem(toWei("2.4"), {from: user2});
        assertAlmostEqual((await composite.index()).toString(), toWei("1.2"));
        assertAlmostEqual((await composite.balanceOf(user2)).toString(), toWei("3.6"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("63.6"));
        assertAlmostEqual((await composite.userShare(user2)).toString(), toWei("3"));
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("53"));

        // User2 should get 0.792 plus1 and 1.584 plus2
        assertAlmostEqual((await plus1.balanceOf(user2)).toString(), "792000");
        assertAlmostEqual((await plus2.balanceOf(user2)).toString(), toWei("1.584"));

        // Should collect the fees after another round of rebase!
        await composite.rebase();
        // Collect 2.4 * 1% = 0.024 BTC+ from redeem fee.
        // 63.6 + 0.024 = 63.624
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("53"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("63.624"));
        assertAlmostEqual((await composite.index()).toString(), toWei("1.20045"));
    });

    it("should return correct redeem amounts with fee", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        // Set redeem fee to 1%
        await composite.setRedeemFee(100);

        // Redeems 2.4 BTC+ from user2
        const result = await composite.getRedeemAmount(toWei("2.4"));
        assert.deepStrictEqual(result[0], [plus1.address, plus2.address]);
        // User should get 0.792 plus1 and 1.584 plus2
        assertAlmostEqual(result[1][0].toString(), toWei("0.792"));
        assertAlmostEqual(result[1][1].toString(), toWei("1.584"));
        assertAlmostEqual(result[2].toString(), toWei("2"));
        // Collect 2.4 * 1% = 0.024 BTC+ from redeem fee.
        assert.strictEqual(result[3].toString(), toWei("0.024"));
    });

    it("should redeem all BTC+ with fee", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        // Set redeem fee to 2.5%
        await composite.setRedeemFee(250);

        // Redeems all BTC+ from user2
        await composite.redeem(MAX, {from: user2});
        assertAlmostEqual((await composite.index()).toString(), toWei("1.2"));
        assertAlmostEqual((await composite.balanceOf(user2)).toString(), toWei("0"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("60"));
        assert.strictEqual((await composite.userShare(user2)).toString(), toWei("0"));
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("50"));

        // User2 should get 1.95 plus1 and 3.9 plus2
        assertAlmostEqual((await plus1.balanceOf(user2)).toString(), toWei("1.95"));
        assertAlmostEqual((await plus2.balanceOf(user2)).toString(), toWei("3.9"));

        // Should collect the fees after another round of rebase!
        await composite.rebase();
        // Collect 6 * 2.5% = 0.15 BTC+ from redeem fee.
        // 60 + 0.15 = 60.15
        assertAlmostEqual((await composite.totalShares()).toString(), toWei("50"));
        assertAlmostEqual((await composite.totalSupply()).toString(), toWei("60.15"));
        assertAlmostEqual((await composite.index()).toString(), toWei("1.203"));
    });

    it("should transfer BTC+", async () => {
        // Mint 20 token1 to user1
        await token1.mint(user1, "20000000");
        // Mint 20 plus1 to user1
        await token1.approve(plus1.address, "20000000", {from: user1});
        await plus1.mint("20000000", {from: user1});
        // Mint 30 token2 to user1
        await token2.mint(user1, toWei("30"));
        // Mint 30 plus2 to user1
        await token2.approve(plus2.address, toWei("30"), {from: user1});
        await plus2.mint(toWei("30"), {from: user1});

        // Mint 50 composite
        await plus1.approve(composite.address, toWei("20"), {from: user1});
        await plus2.approve(composite.address, toWei("30"), {from: user1});
        await composite.mint([plus1.address, plus2.address], [toWei("20"), toWei("30")], {from: user1});

        // Deposit token1 and token2 into strategies
        await plus1.invest();
        await plus2.invest();
        // Harvest 2 token1 in strategy1
        await token1.mint(strategy1.address, "2000000");
        // Harvest 8 token2 in strategy2
        await token2.mint(strategy2.address, toWei("8"));
        await plus1.rebase();
        await plus2.rebase();
        await composite.rebase();

        // Mint 6 token2 to user2
        await token2.mint(user2, toWei("6"));
        // Mint 6 plus2 to user2
        await token2.approve(plus2.address, toWei("6"), {from: user2});
        await plus2.mint(toWei("6"), {from: user2});
        // Mint 6 BTC+ to user2
        await plus2.approve(composite.address, toWei("6"), {from: user2});
        await composite.mint([plus2.address, plus1.address], [toWei("6"), 0], {from: user2});

        // Transfer 2.4 BTC+ from user1 to user2
        await composite.transfer(user2, toWei("2.4"), {from: user1});

        assertAlmostEqual((await composite.index()).toString(), toWei("1.2"));
        assertAlmostEqual((await composite.balanceOf(user2)).toString(), toWei("8.4"));
        assertAlmostEqual((await composite.balanceOf(user1)).toString(), toWei("57.6"));
        assertAlmostEqual((await composite.userShare(user2)).toString(), toWei("7"));
        assertAlmostEqual((await composite.userShare(user1)).toString(), toWei("48"));
    });
});