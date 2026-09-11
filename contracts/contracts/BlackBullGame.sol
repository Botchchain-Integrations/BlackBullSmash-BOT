// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract BlackBullGame {
    struct Player {
        uint256 totalScore;
        uint256 highScore;
        uint256 maxLevel;
        uint256 gamesPlayed;
        uint256 lastPlayedAt;
        uint256 totalPayout;
    }

    IERC20 public immutable tUSDT;
    address public owner;

    // 1000 in-game points = 1 tUSDT (6 decimals)
    uint256 public constant SCORE_PER_TUSDT = 1000;
    // Max tUSDT paid out per run (10 tUSDT = 10_000_000 * 1e6 micro)
    uint256 public constant MAX_PAYOUT = 10 * 10 ** 6;
    // Min time between submissions per wallet (5 min)
    uint256 public constant MIN_INTERVAL = 5 minutes;

    // Generous 2x caps over realistic per-level max score (rejects script-spam scores)
    mapping(uint256 => uint256) public levelCaps;

    mapping(address => Player) public players;

    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 level,
        uint256 payout,
        uint256 timestamp
    );
    event TreasuryFunded(address indexed funder, uint256 amount);
    event TreasuryWithdrawn(address indexed recipient, uint256 amount);

    constructor(address _tUSDT) {
        require(_tUSDT != address(0), "tUSDT address required");
        owner = msg.sender;
        tUSDT = IERC20(_tUSDT);
        levelCaps[1] = 25_000;
        levelCaps[2] = 40_000;
        levelCaps[3] = 55_000;
        levelCaps[4] = 70_000;
        levelCaps[5] = 90_000;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function submitScore(
        uint256 score,
        uint256 level
    ) external {
        require(score > 0, "score must be > 0");
        require(level >= 1 && level <= 5, "invalid level");
        require(score <= levelCaps[level], "score over cap");

        Player storage p = players[msg.sender];
        require(
            block.timestamp - p.lastPlayedAt >= MIN_INTERVAL,
            "rate limited"
        );

        uint256 payout = (score * 1e6) / SCORE_PER_TUSDT;
        if (payout > MAX_PAYOUT) payout = MAX_PAYOUT;

        p.totalScore += score;
        if (score > p.highScore) {
            p.highScore = score;
        }
        if (level > p.maxLevel) {
            p.maxLevel = level;
        }
        p.gamesPlayed += 1;
        p.lastPlayedAt = block.timestamp;
        p.totalPayout += payout;

        uint256 treasury = tUSDT.balanceOf(address(this));
        if (treasury > 0) {
            uint256 toSend = payout > treasury ? treasury : payout;
            if (toSend > 0) {
                require(tUSDT.transfer(msg.sender, toSend), "payout transfer failed");
            }
        }

        emit ScoreSubmitted(msg.sender, score, level, payout, block.timestamp);
    }

    function treasuryBalance() external view returns (uint256) {
        return tUSDT.balanceOf(address(this));
    }

    function fund(uint256 amount) external {
        require(tUSDT.transferFrom(msg.sender, address(this), amount), "fund transfer failed");
        emit TreasuryFunded(msg.sender, amount);
    }

    function withdrawTreasury(uint256 amount) external onlyOwner {
        uint256 bal = tUSDT.balanceOf(address(this));
        require(amount <= bal, "insufficient treasury");
        require(tUSDT.transfer(owner, amount), "withdraw transfer failed");
        emit TreasuryWithdrawn(owner, amount);
    }

    function setLevelCap(uint256 level, uint256 cap) external onlyOwner {
        levelCaps[level] = cap;
    }

    function getPlayer(
        address player
    ) external view returns (Player memory) {
        return players[player];
    }
}