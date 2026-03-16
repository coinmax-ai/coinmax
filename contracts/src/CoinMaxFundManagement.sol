// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CoinMax Fund Management
/// @notice Unified fund management: collect USDC → deposit to HyperLiquid Vault
///         → withdraw after 24h → distribute to 5 wallets by ratio.
///
///  Complete Flow:
///
///   User USDT
///     │
///     ▼
///   SwapRouter (USDT → USDC via PancakeSwap V3)
///     │
///     ├──▸ cUSD mint (1:1) ──▸ MA mint (1:1) ──▸ Lock (user staking)
///     │
///     ▼
///   FundManagement (this contract) ── collects 100% USDC
///     │
///     ▼
///   100% deposit ──▸ HyperLiquid Vault (via bridge wallet)
///     │                    │
///     │              24h lockup
///     │                    │
///     ▼                    ▼
///   Withdraw all back to FundManagement
///     │
///     ▼
///   Distribute by ratio to 5 wallets:
///     ├── Trading   (交易)   e.g. 30%
///     ├── Ops       (运营)   e.g. 25%
///     ├── Marketing (市场)   e.g. 20%
///     ├── Investor  (资方)   e.g. 15%
///     └── Withdraw  (提现)   e.g. 10%
///
///  Daily Interest:
///   Backend calculates: principal × dailyRate
///   Calls MA.mint(user, interestMA) → Release balance
///
contract CoinMaxFundManagement is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════════

    IERC20 public immutable usdc;

    /// @notice Authorized contracts that can deposit (VaultV2, NodesV2, SwapRouter)
    mapping(address => bool) public authorizedSources;

    /// @notice Wallet used to bridge USDC to HyperLiquid (Circle CCTP)
    address public hlBridgeWallet;

    // ─── 5-Wallet Distribution ────────────────────────────────────────

    enum WalletType { TRADING, OPS, MARKETING, INVESTOR, WITHDRAW }

    struct WalletConfig {
        address wallet;
        uint256 share; // basis points (e.g. 3000 = 30%)
    }

    /// @notice 5 distribution wallets, indexed by WalletType
    WalletConfig[5] public wallets;

    uint256 public constant TOTAL_BASIS = 10_000;

    // ─── Accounting ───────────────────────────────────────────────────

    uint256 public totalReceived;      // cumulative USDC received
    uint256 public totalBridgedToHL;   // cumulative sent to HL
    uint256 public totalWithdrawnFromHL; // cumulative returned from HL
    uint256 public totalDistributed;   // cumulative distributed to wallets

    struct DepositRecord {
        address source;
        uint256 amount;
        uint256 timestamp;
    }

    /// @notice Last 100 deposit records (circular buffer)
    DepositRecord[100] public depositLog;
    uint256 public depositCount;

    // ─── HL Cycle Tracking ────────────────────────────────────────────

    uint256 public lastBridgeTime;     // when funds were last sent to HL
    uint256 public pendingInHL;        // amount currently in HL vault
    uint256 public constant HL_LOCKUP = 24 hours;

    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event FundsReceived(address indexed source, uint256 amount, uint256 timestamp);
    event BridgedToHL(uint256 amount, uint256 timestamp);
    event WithdrawnFromHL(uint256 amount, uint256 timestamp);
    event FundsDistributed(uint256 totalAmount, uint256[5] payouts);
    event WalletsUpdated(address[5] addrs, uint256[5] shares);
    event HLBridgeWalletUpdated(address indexed newWallet);
    event SourceAuthorized(address indexed source, bool authorized);

    // ═══════════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════

    /// @param _usdc USDC token on BSC
    /// @param _hlBridgeWallet Wallet that bridges to HyperLiquid
    constructor(
        address _usdc,
        address _hlBridgeWallet
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_hlBridgeWallet != address(0), "Invalid bridge wallet");

        usdc = IERC20(_usdc);
        hlBridgeWallet = _hlBridgeWallet;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  STEP 1: RECEIVE USDC FROM PLATFORM
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Authorized contracts deposit USDC here
    /// @param amount USDC amount (6 decimals on BSC)
    function deposit(uint256 amount) external whenNotPaused {
        require(authorizedSources[msg.sender], "Not authorized");
        require(amount > 0, "Zero amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        totalReceived += amount;

        depositLog[depositCount % 100] = DepositRecord({
            source: msg.sender,
            amount: amount,
            timestamp: block.timestamp
        });
        depositCount++;

        emit FundsReceived(msg.sender, amount, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  STEP 2: BRIDGE 100% TO HYPERLIQUID VAULT
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Send all USDC to HL bridge wallet → HyperLiquid Vault
    /// @dev Admin triggers this; off-chain bot then deposits into HL vault
    function bridgeToHL() external onlyOwner nonReentrant whenNotPaused {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "No USDC to bridge");

        usdc.safeTransfer(hlBridgeWallet, bal);

        totalBridgedToHL += bal;
        pendingInHL += bal;
        lastBridgeTime = block.timestamp;

        emit BridgedToHL(bal, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  STEP 3: RECEIVE BACK FROM HL (AFTER 24H LOCKUP)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Record funds returned from HyperLiquid vault
    /// @dev Admin calls after withdrawing from HL and sending USDC back here
    /// @param amount The USDC amount returned (may include profit or be less due to loss)
    function recordHLWithdrawal(uint256 amount) external onlyOwner whenNotPaused {
        require(amount > 0, "Zero amount");
        require(pendingInHL > 0, "Nothing pending in HL");

        totalWithdrawnFromHL += amount;
        pendingInHL = 0;

        emit WithdrawnFromHL(amount, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  STEP 4: DISTRIBUTE TO 5 WALLETS BY RATIO
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Distribute all USDC in contract to 5 wallets by configured ratio
    function distribute() external onlyOwner nonReentrant whenNotPaused {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "No USDC to distribute");
        require(wallets[0].wallet != address(0), "Wallets not configured");

        uint256[5] memory payouts;
        uint256 distributed;

        for (uint256 i = 0; i < 5; i++) {
            if (i == 4) {
                // Last wallet gets remainder to avoid dust from rounding
                payouts[i] = bal - distributed;
            } else {
                payouts[i] = (bal * wallets[i].share) / TOTAL_BASIS;
            }

            if (payouts[i] > 0) {
                usdc.safeTransfer(wallets[i].wallet, payouts[i]);
                distributed += payouts[i];
            }
        }

        totalDistributed += distributed;

        emit FundsDistributed(distributed, payouts);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ADMIN — WALLET CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Configure the 5 distribution wallets and their share ratios
    /// @param _addrs [trading, ops, marketing, investor, withdraw]
    /// @param _shares Basis points, must sum to 10000
    function setWallets(
        address[5] calldata _addrs,
        uint256[5] calldata _shares
    ) external onlyOwner {
        uint256 totalShares;
        for (uint256 i = 0; i < 5; i++) {
            require(_addrs[i] != address(0), "Invalid wallet");
            require(_shares[i] > 0, "Share must be > 0");
            totalShares += _shares[i];
            wallets[i] = WalletConfig(_addrs[i], _shares[i]);
        }
        require(totalShares == TOTAL_BASIS, "Shares must total 10000");

        emit WalletsUpdated(_addrs, _shares);
    }

    /// @notice Authorize or revoke a deposit source
    function setAuthorizedSource(address source, bool authorized) external onlyOwner {
        require(source != address(0), "Invalid");
        authorizedSources[source] = authorized;
        emit SourceAuthorized(source, authorized);
    }

    /// @notice Update HL bridge wallet
    function setHLBridgeWallet(address _w) external onlyOwner {
        require(_w != address(0), "Invalid");
        hlBridgeWallet = _w;
        emit HLBridgeWalletUpdated(_w);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Emergency: withdraw any stuck tokens
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid");
        IERC20(token).safeTransfer(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Current USDC balance in this contract
    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Check if 24h lockup has passed since last bridge
    function canWithdrawFromHL() external view returns (bool) {
        if (pendingInHL == 0) return false;
        return block.timestamp >= lastBridgeTime + HL_LOCKUP;
    }

    /// @notice Get all wallet configs
    function getWallets() external view returns (
        address[5] memory addrs,
        uint256[5] memory shares,
        string[5] memory labels
    ) {
        labels = ["Trading", "Ops", "Marketing", "Investor", "Withdraw"];
        for (uint256 i = 0; i < 5; i++) {
            addrs[i] = wallets[i].wallet;
            shares[i] = wallets[i].share;
        }
    }

    /// @notice Get full accounting stats
    function getStats() external view returns (
        uint256 _balance,
        uint256 _totalReceived,
        uint256 _totalBridgedToHL,
        uint256 _totalWithdrawnFromHL,
        uint256 _totalDistributed,
        uint256 _pendingInHL,
        uint256 _depositCount
    ) {
        return (
            usdc.balanceOf(address(this)),
            totalReceived,
            totalBridgedToHL,
            totalWithdrawnFromHL,
            totalDistributed,
            pendingInHL,
            depositCount
        );
    }
}
