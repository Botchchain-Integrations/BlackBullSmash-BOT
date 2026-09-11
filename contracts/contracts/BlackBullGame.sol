// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BlackBullGame {
    struct Player {
        uint256 totalScore;
        uint256 highScore;
        uint256 maxLevel;
        uint256 gamesPlayed;
        uint256 lastPlayedAt;
    }

    mapping(address => Player) public players;

    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 level,
        uint256 timestamp
    );

    function submitScore(
        uint256 score,
        uint256 level
    ) external {
        require(score > 0, "score must be > 0");
        Player storage p = players[msg.sender];
        p.totalScore += score;
        if (score > p.highScore) {
            p.highScore = score;
        }
        if (level > p.maxLevel) {
            p.maxLevel = level;
        }
        p.gamesPlayed += 1;
        p.lastPlayedAt = block.timestamp;
        emit ScoreSubmitted(msg.sender, score, level, block.timestamp);
    }

    function getPlayer(
        address player
    ) external view returns (Player memory) {
        return players[player];
    }
}
