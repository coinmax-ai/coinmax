// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CoinMax Batch Bridge V2 (Simple USDT Accumulator)
/// @notice Receives USDT from Vault deposits + node purchases.
///         Backend edge function (cron) uses thirdweb Bridge API to
///         cross-chain USDT → ARB USDC. Owner withdraws to fund the bridge.
///
///  Flow:
///    Vault.depositPublic / purchaseNodePublic → USDT → this contract
///    4h cron edge function → owner withdraws → thirdweb Bridge → ARB FundRouter
contract CoinMaxBatchBridgeV2 is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;

    uint256 public totalReceived;
    uint256 public totalWithdrawn;
    uint256 public withdrawCount;

    event Withdrawn(address indexed to, uint256 amount, uint256 timestamp);

    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT");
        usdt = IERC20(_usdt);
    }

    /// @notice Get current USDT balance ready for bridging
    function pendingBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /// @notice Owner withdraws USDT to fund thirdweb Bridge cross-chain
    /// @param to Destination (deployer EOA that initiates thirdweb bridge)
    /// @param amount Amount to withdraw
    function withdraw(address to, uint256 amount) external onlyOwner whenNotPaused {
        require(to != address(0), "Invalid address");
        require(amount > 0, "Zero amount");
        usdt.safeTransfer(to, amount);
        totalWithdrawn += amount;
        withdrawCount++;
        emit Withdrawn(to, amount, block.timestamp);
    }

    /// @notice Withdraw all USDT
    function withdrawAll(address to) external onlyOwner whenNotPaused {
        require(to != address(0), "Invalid address");
        uint256 balance = usdt.balanceOf(address(this));
        require(balance > 0, "No USDT");
        usdt.safeTransfer(to, balance);
        totalWithdrawn += balance;
        withdrawCount++;
        emit Withdrawn(to, balance, block.timestamp);
    }

    /// @notice Emergency withdraw any token
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid");
        IERC20(token).safeTransfer(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    receive() external payable {}
}
