// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * FarmTasks Rewards (MTOM) - a self-contained ERC20 used by the Farm Tasks
 * challenge on a test network.
 *
 * Players claim once per stage per UTC day. The frontend sends a 5-bit mask of
 * the stages it has completed; the contract mints the matching reward total.
 * Test-network only: there is no owner and no way to burn or withdraw.
 */
contract FarmRewards {
    string public constant name = "Meadow Farm Rewards";
    string public constant symbol = "MTOM";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    // day => stage mask already paid to a player
    mapping(address => mapping(uint64 => uint8)) public claimedMask;

    // Stage rewards, in whole tokens (25, 50, 75, 125, 200).
    uint256[5] public rewards = [
        25 ether,
        50 ether,
        75 ether,
        125 ether,
        200 ether
    ];

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event RewardsClaimed(
        address indexed player,
        uint64 indexed day,
        uint8 mask,
        uint256 amount
    );

    error AlreadyClaimed();
    error InvalidMask();
    error InsufficientBalance();
    error InsufficientAllowance();

    /** Claims stages 1-5 (bit 0 is stage 1) once each per `day`. */
    function claimRewards(uint64 day, uint8 mask) external returns (uint256) {
        if (mask == 0 || (mask & 0xE0) != 0) revert InvalidMask();

        uint8 already = claimedMask[msg.sender][day];
        if ((already & mask) != 0) revert AlreadyClaimed();
        claimedMask[msg.sender][day] = already | mask;

        uint256 amount;
        for (uint8 i = 0; i < 5; i++) {
            if ((mask & (1 << i)) != 0) amount += rewards[i];
        }

        _mint(msg.sender, amount);
        emit RewardsClaimed(msg.sender, day, mask, amount);
        return amount;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < value) revert InsufficientAllowance();
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
