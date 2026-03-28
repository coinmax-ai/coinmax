// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title ERC2771 Mixin for Upgradeable Contracts
/// @notice Add to any upgradeable contract to support meta-transactions.
///         Override _msgSender() and _msgData() to extract real sender
///         from forwarder-appended calldata.
///
///  Usage:
///    1. Inherit this mixin
///    2. Call _setTrustedForwarder(addr) in initializer
///    3. Use _msgSender() instead of msg.sender for auth checks
abstract contract ERC2771Mixin {
    /// @notice Trusted forwarder address (set by admin)
    address private _trustedForwarder;

    event TrustedForwarderSet(address indexed forwarder);

    function trustedForwarder() public view returns (address) {
        return _trustedForwarder;
    }

    function isTrustedForwarder(address forwarder) public view returns (bool) {
        return forwarder == _trustedForwarder;
    }

    function _setTrustedForwarder(address forwarder) internal {
        _trustedForwarder = forwarder;
        emit TrustedForwarderSet(forwarder);
    }

    function _msgSender() internal view virtual returns (address sender) {
        if (msg.sender == _trustedForwarder && msg.data.length >= 20) {
            // Extract real sender from last 20 bytes (appended by forwarder)
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            sender = msg.sender;
        }
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        if (msg.sender == _trustedForwarder && msg.data.length >= 20) {
            return msg.data[:msg.data.length - 20];
        }
        return msg.data;
    }
}
