// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CoinMax Nodes V2
/// @notice Node subscription contract. Users pay USDT → SwapRouter converts to USDC →
///         USDC arrives here. The contract records the **original USDT amount** (passed by SwapRouter)
///         so that backend always uses USDT value for calculations, regardless of USDC swap rate.
///
///  Flow:  SwapRouter → USDC → NodesV2 → FundDistributor
///  DB:    Records originalUsdtAmount from event for node pricing
contract CoinMaxNodesV2 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Storage ────────────────────────────────────────────────────────

    /// @notice USDC token (received from swap)
    IERC20 public usdc;

    /// @notice Fund distribution contract where payments are forwarded
    address public fundDistributor;

    /// @notice Authorized router contract (CoinMaxSwapRouter)
    address public swapRouter;

    struct NodePlan {
        uint256 price;  // Price in USDT equivalent (18 decimals)
        bool active;
    }

    /// @notice Node plans: "MINI" => $100, "MAX" => $600
    mapping(string => NodePlan) public nodePlans;

    /// @notice Purchase counter for unique order tracking
    uint256 public purchaseCount;

    // ─── Events ─────────────────────────────────────────────────────────

    /// @notice Emitted on every node purchase
    /// @dev Backend should use `originalUsdtAmount` for all pricing/accounting
    event NodePurchasedV2(
        uint256 indexed purchaseId,
        address indexed payer,
        string nodeType,
        uint256 originalUsdtAmount,  // USDT value user intended to pay (for DB)
        uint256 usdcReceived,        // actual USDC received after swap
        bool viaSwapRouter,
        uint256 timestamp
    );

    event FundDistributorUpdated(address indexed oldAddr, address indexed newAddr);
    event SwapRouterUpdated(address indexed oldAddr, address indexed newAddr);
    event PlanUpdated(string nodeType, uint256 price, bool active);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // ─── Constructor ────────────────────────────────────────────────────

    /// @param _usdc USDC token address
    /// @param _fundDistributor Fund distribution contract address
    /// @param _swapRouter CoinMaxSwapRouter contract address
    constructor(
        address _usdc,
        address _fundDistributor,
        address _swapRouter
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_fundDistributor != address(0), "Invalid distributor");
        require(_swapRouter != address(0), "Invalid router");

        usdc = IERC20(_usdc);
        fundDistributor = _fundDistributor;
        swapRouter = _swapRouter;

        // Node plans priced in USDT equivalent (18 decimals)
        nodePlans["MINI"] = NodePlan(100 * 1e18, true);   // $100
        nodePlans["MAX"]  = NodePlan(600 * 1e18, true);   // $600
        emit PlanUpdated("MINI", 100 * 1e18, true);
        emit PlanUpdated("MAX", 600 * 1e18, true);
    }

    // ─── Core: Called by SwapRouter ─────────────────────────────────────

    /// @notice Purchase a node on behalf of a user (called by SwapRouter after swap)
    /// @param payer The actual user who initiated the purchase
    /// @param nodeType "MINI" or "MAX"
    /// @param usdcAmount USDC amount received from swap
    /// @param originalUsdtAmount Original USDT amount the user paid (for DB records)
    function purchaseNodeFrom(
        address payer,
        string calldata nodeType,
        uint256 usdcAmount,
        uint256 originalUsdtAmount
    ) external whenNotPaused {
        require(msg.sender == swapRouter, "Only SwapRouter");
        require(payer != address(0), "Invalid payer");

        NodePlan storage plan = nodePlans[nodeType];
        require(plan.price > 0 && plan.active, "Invalid node type");

        // Validate: original USDT amount must match node price
        require(originalUsdtAmount >= plan.price, "Insufficient USDT amount");

        // Pull USDC from SwapRouter → forward to fund distributor
        usdc.safeTransferFrom(msg.sender, fundDistributor, usdcAmount);

        purchaseCount++;

        emit NodePurchasedV2(
            purchaseCount,
            payer,
            nodeType,
            originalUsdtAmount,
            usdcAmount,
            true,
            block.timestamp
        );
    }

    // ─── Core: Direct USDC Purchase ────────────────────────────────────

    /// @notice Purchase a node directly with USDC (no swap needed)
    /// @param nodeType "MINI" or "MAX"
    function purchaseNode(
        string calldata nodeType
    ) external nonReentrant whenNotPaused {
        NodePlan storage plan = nodePlans[nodeType];
        require(plan.price > 0 && plan.active, "Invalid node type");

        // Pull USDC from user directly to fund distributor
        usdc.safeTransferFrom(msg.sender, fundDistributor, plan.price);

        purchaseCount++;

        emit NodePurchasedV2(
            purchaseCount,
            msg.sender,
            nodeType,
            plan.price,       // same as USDC amount for direct purchase
            plan.price,
            false,
            block.timestamp
        );
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setFundDistributor(address _fundDistributor) external onlyOwner {
        require(_fundDistributor != address(0), "Invalid address");
        address old = fundDistributor;
        fundDistributor = _fundDistributor;
        emit FundDistributorUpdated(old, _fundDistributor);
    }

    function setSwapRouter(address _swapRouter) external onlyOwner {
        require(_swapRouter != address(0), "Invalid address");
        address old = swapRouter;
        swapRouter = _swapRouter;
        emit SwapRouterUpdated(old, _swapRouter);
    }

    function setUsdc(address _usdc) external onlyOwner {
        require(_usdc != address(0), "Invalid address");
        usdc = IERC20(_usdc);
    }

    function setPlan(string calldata nodeType, uint256 price, bool active) external onlyOwner {
        nodePlans[nodeType] = NodePlan(price, active);
        emit PlanUpdated(nodeType, price, active);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Emergency: recover tokens stuck in this contract
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }
}
