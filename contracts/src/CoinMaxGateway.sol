// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Interface for cUSDT token (thirdweb Token with mintTo)
interface ICUSDToken {
    function mintTo(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Interface for CoinMaxNodesV2
interface INodesV2 {
    function purchaseNodeFrom(
        address payer,
        string calldata nodeType,
        uint256 cUsdtAmount,
        uint256 originalUsdtAmount
    ) external;
}

/// @notice Interface for CoinMaxVaultV2
interface IVaultV2 {
    function depositFrom(
        address depositor,
        uint256 cUsdtAmount,
        uint256 originalUsdtAmount,
        uint256 planIndex
    ) external;
}

/// @title CoinMax Gateway
/// @notice Entry point for users: accepts USDT, mints cUSDT 1:1, then routes to
///         NodesV2 (node subscription) or VaultV2 (vault deposit).
///
///  Flow:  User USDT → Gateway mints cUSDT 1:1 → NodesV2 / VaultV2
///
///  Why this guarantees 1:1:
///    - cUSDT is a thirdweb Token contract, this Gateway has MINTER_ROLE
///    - Every 1 USDT deposited = exactly 1 cUSDT minted (same decimals)
///    - No AMM, no slippage, no price deviation
///    - USDT is held by this contract (or forwarded to treasury)
///    - cUSDT total supply always equals total USDT collected
///
///  Redemption (optional future):
///    - User burns cUSDT → Gateway sends back USDT 1:1
///    - Ensures cUSDT is always fully backed
contract CoinMaxGateway is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Storage ────────────────────────────────────────────────────────

    /// @notice USDT token (input from user)
    IERC20 public usdt;

    /// @notice cUSDT token (thirdweb Token — minted 1:1 for USDT)
    ICUSDToken public cUsdt;

    /// @notice NodesV2 contract for node subscriptions
    INodesV2 public nodesV2;

    /// @notice VaultV2 contract for vault deposits
    IVaultV2 public vaultV2;

    /// @notice Treasury address — USDT backing is forwarded here
    address public treasury;

    /// @notice Whether USDT backing is forwarded to treasury (true) or held in this contract (false)
    bool public forwardToTreasury;

    /// @notice Total USDT deposited (= total cUSDT ever minted)
    uint256 public totalUsdtDeposited;

    /// @notice Whether redemption (cUSDT → USDT) is enabled
    bool public redemptionEnabled;

    // ─── Events ─────────────────────────────────────────────────────────

    event SwapAndDepositToVault(
        address indexed user,
        uint256 usdtAmount,
        uint256 cUsdtMinted,
        uint256 planIndex,
        uint256 timestamp
    );

    event SwapAndPurchaseNode(
        address indexed user,
        uint256 usdtAmount,
        uint256 cUsdtMinted,
        string nodeType,
        uint256 timestamp
    );

    event DirectDepositToVault(
        address indexed user,
        uint256 cUsdtAmount,
        uint256 planIndex,
        uint256 timestamp
    );

    event DirectPurchaseNode(
        address indexed user,
        uint256 cUsdtAmount,
        string nodeType,
        uint256 timestamp
    );

    event CUsdtMinted(address indexed user, uint256 usdtAmount, uint256 cUsdtAmount);
    event CUsdtRedeemed(address indexed user, uint256 cUsdtBurned, uint256 usdtReturned);
    event ConfigUpdated(string param);

    // ─── Constructor ────────────────────────────────────────────────────

    /// @param _usdt USDT token address
    /// @param _cUsdt cUSDT token address (thirdweb Token — Gateway needs MINTER_ROLE)
    /// @param _nodesV2 CoinMaxNodesV2 contract address
    /// @param _vaultV2 CoinMaxVaultV2 contract address
    /// @param _treasury Treasury address to receive USDT backing
    constructor(
        address _usdt,
        address _cUsdt,
        address _nodesV2,
        address _vaultV2,
        address _treasury
    ) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT");
        require(_cUsdt != address(0), "Invalid cUSDT");
        require(_nodesV2 != address(0), "Invalid NodesV2");
        require(_vaultV2 != address(0), "Invalid VaultV2");
        require(_treasury != address(0), "Invalid treasury");

        usdt = IERC20(_usdt);
        cUsdt = ICUSDToken(_cUsdt);
        nodesV2 = INodesV2(_nodesV2);
        vaultV2 = IVaultV2(_vaultV2);
        treasury = _treasury;
        forwardToTreasury = true;
    }

    // ─── Core: USDT → cUSDT → Vault ───────────────────────────────────

    /// @notice Pay USDT → mint cUSDT 1:1 → deposit into VaultV2
    /// @param usdtAmount Amount of USDT to pay (18 decimals on BSC)
    /// @param planIndex Staking plan index in VaultV2
    function depositVault(
        uint256 usdtAmount,
        uint256 planIndex
    ) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "Zero amount");

        // 1. Pull USDT from user
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        // 2. Mint cUSDT 1:1 to this contract
        uint256 cUsdtAmount = usdtAmount; // exactly 1:1
        cUsdt.mintTo(address(this), cUsdtAmount);

        // 3. Forward USDT backing to treasury
        _handleUsdtBacking(usdtAmount);

        // 4. Approve cUSDT to VaultV2 and deposit
        cUsdt.approve(address(vaultV2), cUsdtAmount);
        vaultV2.depositFrom(msg.sender, cUsdtAmount, usdtAmount, planIndex);

        totalUsdtDeposited += usdtAmount;

        emit CUsdtMinted(msg.sender, usdtAmount, cUsdtAmount);
        emit SwapAndDepositToVault(msg.sender, usdtAmount, cUsdtAmount, planIndex, block.timestamp);
    }

    // ─── Core: USDT → cUSDT → Node ────────────────────────────────────

    /// @notice Pay USDT → mint cUSDT 1:1 → purchase node in NodesV2
    /// @param usdtAmount Amount of USDT to pay (18 decimals on BSC)
    /// @param nodeType Node type identifier (e.g. "MINI", "MAX")
    function purchaseNode(
        uint256 usdtAmount,
        string calldata nodeType
    ) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "Zero amount");

        // 1. Pull USDT from user
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        // 2. Mint cUSDT 1:1
        uint256 cUsdtAmount = usdtAmount;
        cUsdt.mintTo(address(this), cUsdtAmount);

        // 3. Forward USDT backing
        _handleUsdtBacking(usdtAmount);

        // 4. Approve cUSDT to NodesV2 and purchase
        cUsdt.approve(address(nodesV2), cUsdtAmount);
        nodesV2.purchaseNodeFrom(msg.sender, nodeType, cUsdtAmount, usdtAmount);

        totalUsdtDeposited += usdtAmount;

        emit CUsdtMinted(msg.sender, usdtAmount, cUsdtAmount);
        emit SwapAndPurchaseNode(msg.sender, usdtAmount, cUsdtAmount, nodeType, block.timestamp);
    }

    // ─── Core: Direct cUSDT (user already has cUSDT) ──────────────────

    /// @notice Deposit cUSDT directly into VaultV2 (skip mint)
    function directDepositVault(
        uint256 cUsdtAmount,
        uint256 planIndex
    ) external nonReentrant whenNotPaused {
        require(cUsdtAmount > 0, "Zero amount");

        IERC20(address(cUsdt)).safeTransferFrom(msg.sender, address(this), cUsdtAmount);
        cUsdt.approve(address(vaultV2), cUsdtAmount);
        vaultV2.depositFrom(msg.sender, cUsdtAmount, cUsdtAmount, planIndex);

        emit DirectDepositToVault(msg.sender, cUsdtAmount, planIndex, block.timestamp);
    }

    /// @notice Purchase node with cUSDT directly (skip mint)
    function directPurchaseNode(
        uint256 cUsdtAmount,
        string calldata nodeType
    ) external nonReentrant whenNotPaused {
        require(cUsdtAmount > 0, "Zero amount");

        IERC20(address(cUsdt)).safeTransferFrom(msg.sender, address(this), cUsdtAmount);
        cUsdt.approve(address(nodesV2), cUsdtAmount);
        nodesV2.purchaseNodeFrom(msg.sender, nodeType, cUsdtAmount, cUsdtAmount);

        emit DirectPurchaseNode(msg.sender, cUsdtAmount, nodeType, block.timestamp);
    }

    // ─── Core: Standalone Mint / Redeem ─────────────────────────────────

    /// @notice Mint cUSDT by depositing USDT 1:1 (standalone, no node/vault action)
    /// @param usdtAmount Amount of USDT to convert
    function mint(uint256 usdtAmount) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "Zero amount");

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        uint256 cUsdtAmount = usdtAmount; // 1:1
        cUsdt.mintTo(msg.sender, cUsdtAmount);

        _handleUsdtBacking(usdtAmount);
        totalUsdtDeposited += usdtAmount;

        emit CUsdtMinted(msg.sender, usdtAmount, cUsdtAmount);
    }

    /// @notice Redeem cUSDT back to USDT 1:1 (burn cUSDT, receive USDT)
    /// @param cUsdtAmount Amount of cUSDT to redeem
    function redeem(uint256 cUsdtAmount) external nonReentrant whenNotPaused {
        require(redemptionEnabled, "Redemption disabled");
        require(cUsdtAmount > 0, "Zero amount");

        // Check contract has enough USDT to cover redemption
        uint256 usdtBalance = usdt.balanceOf(address(this));
        require(usdtBalance >= cUsdtAmount, "Insufficient USDT reserves");

        // Pull cUSDT from user and burn
        IERC20(address(cUsdt)).safeTransferFrom(msg.sender, address(this), cUsdtAmount);
        cUsdt.burn(cUsdtAmount);

        // Send USDT back 1:1
        usdt.safeTransfer(msg.sender, cUsdtAmount);

        emit CUsdtRedeemed(msg.sender, cUsdtAmount, cUsdtAmount);
    }

    // ─── View ───────────────────────────────────────────────────────────

    /// @notice Get USDT reserves held by this contract (for redemption backing)
    function getUsdtReserves() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /// @notice Get current cUSDT total supply
    function getCUsdtSupply() external view returns (uint256) {
        return IERC20(address(cUsdt)).totalSupply();
    }

    // ─── Internal ───────────────────────────────────────────────────────

    /// @dev Forward USDT to treasury or keep in contract as backing
    function _handleUsdtBacking(uint256 amount) internal {
        if (forwardToTreasury && treasury != address(0)) {
            usdt.safeTransfer(treasury, amount);
        }
        // else: USDT stays in this contract as reserve for redemptions
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
        emit ConfigUpdated("treasury");
    }

    function setForwardToTreasury(bool _forward) external onlyOwner {
        forwardToTreasury = _forward;
        emit ConfigUpdated("forwardToTreasury");
    }

    function setRedemptionEnabled(bool _enabled) external onlyOwner {
        redemptionEnabled = _enabled;
        emit ConfigUpdated("redemptionEnabled");
    }

    function setNodesV2(address _nodesV2) external onlyOwner {
        require(_nodesV2 != address(0), "Invalid address");
        nodesV2 = INodesV2(_nodesV2);
        emit ConfigUpdated("nodesV2");
    }

    function setVaultV2(address _vaultV2) external onlyOwner {
        require(_vaultV2 != address(0), "Invalid address");
        vaultV2 = IVaultV2(_vaultV2);
        emit ConfigUpdated("vaultV2");
    }

    function setCUsdt(address _cUsdt) external onlyOwner {
        require(_cUsdt != address(0), "Invalid address");
        cUsdt = ICUSDToken(_cUsdt);
        emit ConfigUpdated("cUsdt");
    }

    function setUsdt(address _usdt) external onlyOwner {
        require(_usdt != address(0), "Invalid address");
        usdt = IERC20(_usdt);
        emit ConfigUpdated("usdt");
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Emergency: recover tokens stuck in this contract
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        IERC20(token).safeTransfer(to, amount);
    }
}
