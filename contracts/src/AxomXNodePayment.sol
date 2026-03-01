// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoinMax Node Payment
/// @notice Accepts USDC payments for node memberships (MINI / MAX). Reward logic is off-chain.
contract CoinMaxNodePayment is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;

    struct NodePlan {
        uint256 price; // USDC (6 decimals)
        bool active;
    }

    mapping(string => NodePlan) public nodePlans;

    event NodePurchased(
        address indexed payer,
        string nodeType,
        uint256 amount,
        uint256 timestamp
    );
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        usdc = IERC20(_usdc);

        // Initialize node plans
        nodePlans["MINI"] = NodePlan(1000 * 1e6, true);  // $1,000
        nodePlans["MAX"]  = NodePlan(6000 * 1e6, true);   // $6,000
    }

    /// @notice Purchase a node membership
    /// @param nodeType "MINI" or "MAX"
    function purchaseNode(string calldata nodeType) external nonReentrant {
        NodePlan storage plan = nodePlans[nodeType];
        require(plan.price > 0 && plan.active, "Invalid node type");
        require(usdc.transferFrom(msg.sender, address(this), plan.price), "Transfer failed");
        emit NodePurchased(msg.sender, nodeType, plan.price, block.timestamp);
    }

    /// @notice Owner updates a node plan price
    function setPlan(string calldata nodeType, uint256 price, bool active) external onlyOwner {
        nodePlans[nodeType] = NodePlan(price, active);
    }

    /// @notice Owner withdraws funds
    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(usdc.transfer(to, amount), "Withdraw failed");
        emit Withdrawn(to, amount);
    }

    function withdrawAll(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "No balance");
        require(usdc.transfer(to, bal), "Withdraw failed");
        emit Withdrawn(to, bal);
    }

    function getBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
