import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("BlackBullGame", function () {
  async function deployGame() {
    const [owner, playerA, playerB] = await ethers.getSigners();
    const Game = await ethers.getContractFactory("BlackBullGame");
    const game = await Game.deploy();
    return { game, owner, playerA, playerB };
  }

  it("starts with zeroed stats", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    const p = await game.getPlayer(playerA.address);
    expect(p.totalScore).to.equal(0n);
    expect(p.highScore).to.equal(0n);
    expect(p.maxLevel).to.equal(0n);
    expect(p.gamesPlayed).to.equal(0n);
  });

  it("rejects zero score", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await expect(game.connect(playerA).submitScore(0n, 1n)).to.be.revertedWith(
      "score must be > 0"
    );
  });

  it("records first run", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(1000n, 1n);
    const p = await game.getPlayer(playerA.address);
    expect(p.totalScore).to.equal(1000n);
    expect(p.highScore).to.equal(1000n);
    expect(p.maxLevel).to.equal(1n);
    expect(p.gamesPlayed).to.equal(1n);
  });

  it("accumulates totals and updates high score and max level", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(1000n, 1n);
    await game.connect(playerA).submitScore(500n, 2n);
    await game.connect(playerA).submitScore(2000n, 3n);

    const p = await game.getPlayer(playerA.address);
    expect(p.totalScore).to.equal(3500n);
    expect(p.highScore).to.equal(2000n);
    expect(p.maxLevel).to.equal(3n);
    expect(p.gamesPlayed).to.equal(3n);
  });

  it("does not regress high score or max level", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    await game.connect(playerA).submitScore(2000n, 3n);
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

  it("emits ScoreSubmitted with score, level and timestamp", async function () {
    const { game, playerA } = await loadFixture(deployGame);
    const tx = await game.connect(playerA).submitScore(1500n, 2n);
    const receipt = await tx.wait();
    const iface = game.interface;
    const args = iface.parseLog({ data: receipt.logs[0].data, topics: receipt.logs[0].topics })!.args;
    expect(String(args[1])).to.equal("1500");
    expect(String(args[2])).to.equal("2");
    expect(BigInt(args[3])).to.be.greaterThan(0n);
  });
});