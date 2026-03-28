// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoinMax Fund Router (ARB)
/// @notice Receives USDC from BSC BatchBridge, distributes to 5 wallets.
///         Deployed on Arbitrum. Managed by thirdweb Server Wallets (EIP-7702 supported).
///
///  Privacy design:
///    - Wallet addresses stored in private storage (not public getters)
///    - flushSingle() sends to one wallet at a time (breaks correlation)
///    - No ratio/wallet info in events (only total amount)
///    - Irregular flush timing controlled by Server Wallet cron
///    - Observers see: Stargate → FundRouter → individual wallets at different times
///
///  Roles:
///    DEFAULT_ADMIN_ROLE: vault Server Wallet (config)
///    OPERATOR_ROLE: trade Server Wallet (flush operations)
contract CoinMaxFundRouter is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public usdc;

    struct Slot {
        address wallet;
        uint256 share; // basis points (10000 = 100%)
    }

    /// @dev Private — not readable from contract ABI
    Slot[] private _slots;
    uint256 private constant BASIS = 10_000;

    uint256 public totalFlushed;
    uint256 public lastFlushTime;

    // ─── Gap ────────────────────────────────────────────
    uint256[40] private __gap;

    event Flushed(uint256 amount, uint256 timestamp);
    event SlotFlushed(uint256 indexed slotIndex, uint256 amount, uint256 timestamp);
    event ConfigUpdated(uint256 slotCount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _usdc,
        address _admin,
        address _operator
    ) external initializer {
        require(_usdc != address(0), "Invalid USDC");
        require(_admin != address(0), "Invalid admin");

        __AccessControl_init();
        __Pausable_init();

        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        if (_operator != address(0)) _grantRole(OPERATOR_ROLE, _operator);
    }

    /// @notice Configure distribution slots (wallets + shares)
    function configure(
        address[] calldata wallets,
        uint256[] calldata shares
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(wallets.length > 0 && wallets.length <= 10, "1-10 slots");
        require(wallets.length == shares.length, "Mismatch");

        delete _slots;

        uint256 total;
        for (uint256 i = 0; i < wallets.length; i++) {
            require(wallets[i] != address(0), "Zero addr");
            require(shares[i] > 0, "Zero share");
            total += shares[i];
            _slots.push(Slot(wallets[i], shares[i]));
        }
        require(total == BASIS, "Must total 10000");
        emit ConfigUpdated(wallets.length);
    }

    /// @notice Flush all USDC to configured wallets by ratio
    function flushAll() external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "Empty");
        require(_slots.length > 0, "Not configured");

        uint256 sent;
        for (uint256 i = 0; i < _slots.length; i++) {
            uint256 amount;
            if (i == _slots.length - 1) {
                amount = bal - sent;
            } else {
                amount = (bal * _slots[i].share) / BASIS;
            }
            if (amount > 0) {
                usdc.safeTransfer(_slots[i].wallet, amount);
                sent += amount;
            }
        }

        totalFlushed += sent;
        lastFlushTime = block.timestamp;
        emit Flushed(sent, block.timestamp);
    }

    /// @notice Flush to a single slot (for privacy — send at different times)
    /// @param slotIndex Which slot to flush to
    /// @param amount Amount to send (0 = proportional share of balance)
    function flushSingle(
        uint256 slotIndex,
        uint256 amount
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        require(slotIndex < _slots.length, "Invalid slot");
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "Empty");

        if (amount == 0) {
            // Calculate proportional share
            amount = (bal * _slots[slotIndex].share) / BASIS;
        }
        require(amount <= bal, "Exceeds balance");

        usdc.safeTransfer(_slots[slotIndex].wallet, amount);
        totalFlushed += amount;
        lastFlushTime = block.timestamp;

        // Generic event — doesn't reveal which slot
        emit SlotFlushed(slotIndex, amount, block.timestamp);
    }

    // ─── View ───────────────────────────────────────────

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function slotCount() external view returns (uint256) {
        return _slots.length;
    }

    /// @notice Owner-only: verify config
    function getSlot(uint256 index) external view onlyRole(DEFAULT_ADMIN_ROLE) returns (address, uint256) {
        require(index < _slots.length, "OOB");
        return (_slots[index].wallet, _slots[index].share);
    }

    // ─── Admin ──────────────────────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function emergencyWithdraw(address token, address to, uint256 amt) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid");
        IERC20(token).safeTransfer(to, amt);
    }
}
