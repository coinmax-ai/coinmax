// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @title CoinMax Forwarder (EIP-2771)
/// @notice Trusted forwarder for meta-transactions.
///         Server Wallets sign, Relayer pays gas, contracts see correct _msgSender.
///
///  Flow:
///    Server Wallet signs ForwardRequest off-chain
///    → Relayer submits execute() to this Forwarder (pays gas)
///    → Forwarder calls target contract with Server Wallet address appended
///    → Target contract uses _msgSender() = Server Wallet (not Relayer)
///
///  On-chain visibility:
///    Observer sees: Relayer → Forwarder → Contract
///    Observer does NOT see: which Server Wallet signed
contract CoinMaxForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("CoinMaxForwarder") {}
}
