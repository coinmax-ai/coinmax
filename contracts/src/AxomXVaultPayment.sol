// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoinMax Vault Payment
/// @notice Accepts USDC deposits for vault plans. Reward logic is off-chain (Supabase DB).
contract CoinMaxVaultPayment is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;

    uint256 public minDeposit = 50 * 1e6; // 50 USDC

    // Valid plan IDs
    mapping(string => bool) public validPlans;

    event VaultDeposit(
        address indexed payer,
        uint256 amount,
        string planType,
        uint256 timestamp
    );
    event Withdrawn(address indexed to, uint256 amount);
    event MinDepositUpdated(uint256 newMin);

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        usdc = IERC20(_usdc);

        // Initialize valid vault plans
        validPlans["5_DAYS"] = true;
        validPlans["15_DAYS"] = true;
        validPlans["45_DAYS"] = true;
    }

    /// @notice Deposit USDC for a vault plan
    /// @param amount USDC amount (6 decimals)
    /// @param planType Plan identifier (e.g. "5_DAYS", "15_DAYS", "45_DAYS")
    function deposit(uint256 amount, string calldata planType) external nonReentrant {
        require(amount >= minDeposit, "Below minimum deposit");
        require(validPlans[planType], "Invalid plan type");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit VaultDeposit(msg.sender, amount, planType, block.timestamp);
    }

    /// @notice Owner adds/removes valid plan types
    function setPlan(string calldata planType, bool active) external onlyOwner {
        validPlans[planType] = active;
    }

    /// @notice Owner updates minimum deposit
    function setMinDeposit(uint256 _minDeposit) external onlyOwner {
        minDeposit = _minDeposit;
        emit MinDepositUpdated(_minDeposit);
    }

    /// @notice Owner withdraws funds
    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(usdc.transfer(to, amount), "Withdraw failed");
        emit Withdrawn(to, amount);
    }

    /// @notice Owner withdraws all USDC
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
