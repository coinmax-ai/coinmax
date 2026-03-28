// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Oracle interface for MA price
interface IMAOracle {
    function getPrice() external view returns (uint256);
    function getPriceUnsafe() external view returns (uint256);
}

/// @title CoinMax FlashSwap — MA ↔ USDT/USDC instant exchange
/// @notice Deploy on BSC + ARB with same address (CREATE2).
///         Users swap MA for USDT/USDC at Oracle price with 50% holding rule.
///
///  Flow:
///    1. User sends MA to this contract
///    2. Contract checks 50% rule (user must keep half their MA)
///    3. Contract calculates USDT output = MA × Oracle price
///    4. Contract sends USDT to user (from its liquidity pool)
///    5. MA received is held (admin can burn or redistribute)
///
///  Reverse flow (buy MA):
///    1. User sends USDT
///    2. Contract calculates MA output = USDT / Oracle price
///    3. Contract sends MA to user (from its pool)
///
///  Liquidity: admin deposits USDT/USDC + MA into this contract
///  Fee: 0.3% on all swaps → stays in contract as profit
contract CoinMaxFlashSwap is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public maToken;
    IERC20 public usdt;
    IERC20 public usdc;
    IMAOracle public oracle;

    /// @notice Swap fee in basis points (30 = 0.3%)
    uint256 public feeBps;

    /// @notice Holding rule: user must keep this % of MA (5000 = 50%)
    uint256 public holdingRuleBps;

    /// @notice Minimum swap amount (prevent dust swaps)
    uint256 public minSwapAmount;

    /// @notice Cumulative stats
    uint256 public totalMAReceived;
    uint256 public totalUSDTPaid;
    uint256 public totalFees;
    uint256 public swapCount;

    uint256[30] private __gap;

    event Swapped(
        address indexed user,
        bool maToUsd,
        uint256 maAmount,
        uint256 usdAmount,
        uint256 fee,
        uint256 price,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _maToken,
        address _usdt,
        address _usdc,
        address _oracle,
        address _admin
    ) external initializer {
        require(_maToken != address(0) && _usdt != address(0) && _oracle != address(0) && _admin != address(0), "Invalid");

        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);

        maToken = IERC20(_maToken);
        usdt = IERC20(_usdt);
        usdc = IERC20(_usdc);
        oracle = IMAOracle(_oracle);

        feeBps = 30;           // 0.3%
        holdingRuleBps = 5000; // must keep 50%
        minSwapAmount = 1e18;  // min 1 MA or 1 USDT
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE: MA → USDT
    // ═══════════════════════════════════════════════════════════════

    /// @notice Swap MA for USDT
    /// @param maAmount Amount of MA to sell
    function swapMAtoUSDT(uint256 maAmount) external nonReentrant whenNotPaused {
        _swapMAtoStable(maAmount, usdt);
    }

    /// @notice Swap MA for USDC
    /// @param maAmount Amount of MA to sell
    function swapMAtoUSDC(uint256 maAmount) external nonReentrant whenNotPaused {
        _swapMAtoStable(maAmount, usdc);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE: USDT → MA
    // ═══════════════════════════════════════════════════════════════

    /// @notice Buy MA with USDT
    /// @param usdtAmount Amount of USDT to spend
    function swapUSDTtoMA(uint256 usdtAmount) external nonReentrant whenNotPaused {
        _swapStableToMA(usdtAmount, usdt);
    }

    /// @notice Buy MA with USDC
    /// @param usdcAmount Amount of USDC to spend
    function swapUSDCtoMA(uint256 usdcAmount) external nonReentrant whenNotPaused {
        _swapStableToMA(usdcAmount, usdc);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW
    // ═══════════════════════════════════════════════════════════════

    /// @notice Preview MA → USDT swap output
    function previewMAtoUSD(uint256 maAmount) external view returns (uint256 usdOut, uint256 fee) {
        uint256 price = oracle.getPriceUnsafe();
        uint256 gross = (maAmount * price) / 1e6;
        fee = (gross * feeBps) / 10000;
        usdOut = gross - fee;
    }

    /// @notice Preview USDT → MA swap output
    function previewUSDtoMA(uint256 usdAmount) external view returns (uint256 maOut, uint256 fee) {
        uint256 price = oracle.getPriceUnsafe();
        fee = (usdAmount * feeBps) / 10000;
        uint256 net = usdAmount - fee;
        maOut = (net * 1e6) / price;
    }

    /// @notice Get user's max swappable MA (50% rule)
    function getSwapQuota(address user) external view returns (uint256) {
        uint256 balance = maToken.balanceOf(user);
        return (balance * (10000 - holdingRuleBps)) / 10000;
    }

    /// @notice Get contract liquidity
    function getLiquidity() external view returns (uint256 maLiq, uint256 usdtLiq, uint256 usdcLiq) {
        maLiq = maToken.balanceOf(address(this));
        usdtLiq = usdt.balanceOf(address(this));
        usdcLiq = address(usdc) != address(0) ? usdc.balanceOf(address(this)) : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setFeeBps(uint256 _bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bps <= 500, "Max 5%");
        feeBps = _bps;
    }

    function setHoldingRuleBps(uint256 _bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bps <= 9000, "Max 90%");
        holdingRuleBps = _bps;
    }

    function setMinSwapAmount(uint256 _min) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minSwapAmount = _min;
    }

    function setOracle(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_oracle != address(0), "Invalid");
        oracle = IMAOracle(_oracle);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @notice Withdraw liquidity or accumulated fees
    function withdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid");
        IERC20(token).safeTransfer(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _swapMAtoStable(uint256 maAmount, IERC20 stable) internal {
        require(maAmount >= minSwapAmount, "Below min");

        // 50% holding rule
        uint256 userBalance = maToken.balanceOf(msg.sender);
        uint256 maxSwap = (userBalance * (10000 - holdingRuleBps)) / 10000;
        require(maAmount <= maxSwap, "Exceeds swap quota (50% rule)");

        // Get price from Oracle
        uint256 price = oracle.getPrice();
        require(price > 0, "Invalid price");

        // Calculate output: gross = maAmount × price / 1e6 (price is 6 decimals)
        uint256 gross = (maAmount * price) / 1e6;
        uint256 fee = (gross * feeBps) / 10000;
        uint256 netOut = gross - fee;

        require(netOut > 0, "Output too small");
        require(stable.balanceOf(address(this)) >= netOut, "Insufficient liquidity");

        // Execute
        maToken.safeTransferFrom(msg.sender, address(this), maAmount);
        stable.safeTransfer(msg.sender, netOut);

        totalMAReceived += maAmount;
        totalUSDTPaid += netOut;
        totalFees += fee;
        swapCount++;

        emit Swapped(msg.sender, true, maAmount, netOut, fee, price, block.timestamp);
    }

    function _swapStableToMA(uint256 stableAmount, IERC20 stable) internal {
        require(stableAmount >= minSwapAmount, "Below min");

        uint256 price = oracle.getPrice();
        require(price > 0, "Invalid price");

        uint256 fee = (stableAmount * feeBps) / 10000;
        uint256 net = stableAmount - fee;
        uint256 maOut = (net * 1e6) / price;

        require(maOut > 0, "Output too small");
        require(maToken.balanceOf(address(this)) >= maOut, "Insufficient MA liquidity");

        stable.safeTransferFrom(msg.sender, address(this), stableAmount);
        maToken.safeTransfer(msg.sender, maOut);

        swapCount++;
        totalFees += fee;

        emit Swapped(msg.sender, false, maOut, stableAmount, fee, price, block.timestamp);
    }
}
