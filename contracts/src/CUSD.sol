// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title cUSD Token
/// @notice ERC20 stablecoin with role-based minting, supply cap, and emergency pause.
///         Backed 1:1 by USDT held in PancakeSwap V3 pool.
///
///  Security features:
///    1. MINTER_ROLE — only authorized contracts (LiquidityManager) can mint
///    2. PAUSER_ROLE — can freeze all transfers in emergency
///    3. Supply cap — hard limit prevents infinite minting if minter key leaks
///    4. Per-mint limit — single mint call capped to prevent large-scale exploit
///    5. Cooldown — rate limit on minting per minter address
///    6. Burnable — tokens can be permanently destroyed
///    7. Blacklist — block compromised addresses from transferring
contract CUSD is ERC20, ERC20Burnable, AccessControl, Pausable {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Maximum total supply (default 10M, adjustable by admin)
    uint256 public supplyCap = 10_000_000 * 1e18;

    /// @notice Maximum tokens per single mint call (default 100K)
    uint256 public mintLimit = 100_000 * 1e18;

    /// @notice Minimum seconds between mints per minter address
    uint256 public mintCooldown = 60;

    /// @notice Last mint timestamp per minter address
    mapping(address => uint256) public lastMintTime;

    /// @notice Blacklisted addresses (cannot send or receive)
    mapping(address => bool) public blacklisted;

    // ─── Events ─────────────────────────────────────────────────────────

    event Minted(address indexed minter, address indexed to, uint256 amount);
    event SupplyCapUpdated(uint256 oldCap, uint256 newCap);
    event MintLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event MintCooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event Blacklisted(address indexed account, bool status);

    // ─── Constructor ────────────────────────────────────────────────────

    /// @param _admin Owner address (gets ADMIN + MINTER + PAUSER roles)
    constructor(address _admin) ERC20("cUSD", "cUSD") {
        require(_admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    // ─── Mint ───────────────────────────────────────────────────────────

    /// @notice Mint tokens to an address
    /// @param to Recipient address
    /// @param amount Amount to mint (18 decimals)
    function mintTo(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(to != address(0), "Mint to zero address");
        require(amount > 0, "Zero amount");
        require(amount <= mintLimit, "Exceeds mint limit");
        require(totalSupply() + amount <= supplyCap, "Exceeds supply cap");
        require(
            block.timestamp >= lastMintTime[msg.sender] + mintCooldown,
            "Mint cooldown active"
        );

        lastMintTime[msg.sender] = block.timestamp;
        _mint(to, amount);

        emit Minted(msg.sender, to, amount);
    }

    // ─── Pause ──────────────────────────────────────────────────────────

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Blacklist ──────────────────────────────────────────────────────

    /// @notice Block or unblock an address from all transfers
    function setBlacklist(address account, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "Invalid address");
        blacklisted[account] = status;
        emit Blacklisted(account, status);
    }

    // ─── Admin Config ───────────────────────────────────────────────────

    /// @notice Update maximum total supply cap
    function setSupplyCap(uint256 _cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_cap >= totalSupply(), "Cap below current supply");
        uint256 old = supplyCap;
        supplyCap = _cap;
        emit SupplyCapUpdated(old, _cap);
    }

    /// @notice Update per-mint limit
    function setMintLimit(uint256 _limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_limit > 0, "Invalid limit");
        uint256 old = mintLimit;
        mintLimit = _limit;
        emit MintLimitUpdated(old, _limit);
    }

    /// @notice Update mint cooldown period
    function setMintCooldown(uint256 _seconds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = mintCooldown;
        mintCooldown = _seconds;
        emit MintCooldownUpdated(old, _seconds);
    }

    // ─── Overrides ──────────────────────────────────────────────────────

    /// @dev Block transfers when paused or involving blacklisted addresses
    function _update(address from, address to, uint256 value) internal override {
        require(!blacklisted[from], "Sender blacklisted");
        require(!blacklisted[to], "Recipient blacklisted");

        if (from != address(0) && to != address(0)) {
            // Regular transfer (not mint/burn) — check pause
            require(!paused(), "Transfers paused");
        }

        super._update(from, to, value);
    }
}
