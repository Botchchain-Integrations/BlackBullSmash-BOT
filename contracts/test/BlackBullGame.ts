import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("BlackBullGame", function () {
  async function deployGame() {
    const [owner, playerA, playerB, funder] = await ethers.getSigners();
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();
    const Game = await ethers.getContractFactory("BlackBullGame");
    const game = await Game.deploy(usdt.target);
    return { game, usdt, owner, playerA, playerB, funder };
  }

  it("starts with zeroed stats", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    const p = await game.getPlayer(playerA.address);
    expect(p.totalScore).to.equal(0n);
    expect(p.highScore).to.equal(0n);
    expect(p.maxLevel).to.equal(0n);
    expect(p.gamesPlayed).to.equal(0n);
    expect(p.totalPayout).to.equal(0n);
  });

  it("rejects zero score", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await expect(game.connect(playerA).submitScore(0n, 1n)).to.be.revertedWith(
      "score must be > 0"
    );
  });

  it("rejects invalid level", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await expect(game.connect(playerA).submitScore(1000n, 0n)).to.be.revertedWith(
      "invalid level"
    );
    await expect(game.connect(playerA).submitScore(1000n, 6n)).to.be.revertedWith(
      "invalid level"
    );
  });

  it("rejects scores over the level cap", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await expect(game.connect(playerA).submitScore(99999n, 1n)).to.be.revertedWith(
      "score over cap"
    );
  });

  it("records first run with payout recorded regardless of treasury", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(1000n, 1n);
    const p = await game.getPlayer(playerA.address);
    expect(p.totalScore).to.equal(1000n);
    expect(p.highScore).to.equal(1000n);
    expect(p.maxLevel).to.equal(1n);
    expect(p.gamesPlayed).to.equal(1n);
    expect(p.totalPayout).to.equal(1_000_000n); // 1000 score = 1 tUSDT
  });

  it("accumulates totals and updates high score and max level", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(1000n, 1n);
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);
    await game.connect(playerA).submitScore(500n, 2n);
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);
    await game.connect(playerA).submitScore(2000n, 3n);
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);

    const p = await game.getPlayer(playerA.address);
    expect(p.totalScore).to.equal(3500n);
    expect(p.highScore).to.equal(2000n);
    expect(p.maxLevel).to.equal(3n);
    expect(p.gamesPlayed).to.equal(3n);
  });

  it("enforces the 5-minute rate limit", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(1000n, 1n);
    await expect(game.connect(playerA).submitScore(1000n, 1n)).to.be.revertedWith(
      "rate limited"
    );
  });

  it("does not regress high score or max level", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(2000n, 3n);
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);
    await game.connect(playerA).submitScore(100n, 1n);

    const p = await game.getPlayer(playerA.address);
    expect(p.highScore).to.equal(2000n);
    expect(p.maxLevel).to.equal(3n);
    expect(p.totalScore).to.equal(2100n);
    expect(p.gamesPlayed).to.equal(2n);
  });

  it("tracks players independently", async function () {
    const { game, playerA, playerB } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(1000n, 1n);

    const pA = await game.getPlayer(playerA.address);
    const pB = await game.getPlayer(playerB.address);
    expect(pA.gamesPlayed).to.equal(1n);
    expect(pB.gamesPlayed).to.equal(0n);
  });

  it("pays out tUSDT to the player when treasury is funded", async function () {
    const { game, usdt, funder, playerA } = await loadFixture(deployGame);
    await usdt.mint(funder.address, 5_000_000n);
    await usdt.connect(funder).approve(game.target, 5_000_000n);
    await game.connect(funder).fund(5_000_000n);
    expect(await game.treasuryBalance()).to.equal(5_000_000n);

    const before = await usdt.balanceOf(playerA.address);
    await game.connect(playerA).submitScore(2000n, 2n);
    const after = await usdt.balanceOf(playerA.address);
    // 2000 score = 2 tUSDT payout
    expect(after - before).to.equal(2_000_000n);
    expect(await game.treasuryBalance()).to.equal(3_000_000n);
  });

  it("pays out at most MAX_PAYOUT per run", async function () {
    const { game, usdt, funder, playerA } = await loadFixture(deployGame);
    await usdt.mint(funder.address, 50_000_000n);
    await usdt.connect(funder).approve(game.target, 50_000_000n);
    await game.connect(funder).fund(50_000_000n);

    // score 50000 at level 5 (cap 90000 allows it) => payout would be 50 tUSDT, capped at 10
    await game.connect(playerA).submitScore(50_000n, 5n);
    const p = await game.getPlayer(playerA.address);
    expect(p.totalPayout).to.equal(10_000_000n);
  });

  it("caps payouts to the available treasury", async function () {
    const { game, usdt, funder, playerA } = await loadFixture(deployGame);
    await usdt.mint(funder.address, 1_000_000n); // only 1 tUSDT in treasury
    await usdt.connect(funder).approve(game.target, 1_000_000n);
    await game.connect(funder).fund(1_000_000n);

    const before = await usdt.balanceOf(playerA.address);
    await game.connect(playerA).submitScore(50_000n, 5n); // would be 10 tUSDT
    const after = await usdt.balanceOf(playerA.address);
    expect(after - before).to.equal(1_000_000n); // drained full treasury
    expect(await game.treasuryBalance()).to.equal(0n);
  });

  it("only owner can withdraw treasury", async function () {
    const { game, usdt, funder, playerA } = await loadFixture(deployGame);
    await usdt.mint(funder.address, 1_000_000n);
    await usdt.connect(funder).approve(game.target, 1_000_000n);
    await game.connect(funder).fund(1_000_000n);

    await expect(game.connect(playerA).withdrawTreasury(100n)).to.be.revertedWith(
      "not owner"
    );
    await game.withdrawTreasury(1_000_000n);
    expect(await game.treasuryBalance()).to.equal(0n);
  });

  it("emits ScoreSubmitted with score, level and payout", async function () {
    const { game, usdt, funder, playerA } = await loadFixture(deployGame);
    await usdt.mint(funder.address, 5_000_000n);
    await usdt.connect(funder).approve(game.target, 5_000_000n);
    await game.connect(funder).fund(5_000_000n);

    const tx = await game.connect(playerA).submitScore(1500n, 2n);
    const receipt = await tx.wait();
    const iface = game.interface;
    const args = iface.parseLog({ data: receipt.logs[0].data, topics: receipt.logs[0].topics })!.args;
    expect(String(args[1])).to.equal("1500");
    expect(String(args[2])).to.equal("2");
    expect(String(args[3])).to.equal("1500000"); // 1.5 tUSDT
    expect(BigInt(args[4])).to.be.greaterThan(0n);
  });
});