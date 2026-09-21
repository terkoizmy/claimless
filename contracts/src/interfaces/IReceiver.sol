// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IReceiver
/// @notice Chainlink CRE report receiver interface.
///
/// @dev WHY THIS EXISTS
/// When a CRE workflow writes on-chain, it does not call our contract directly.
/// The flow is:
///
///   1. the workflow produces a DON-signed report,
///   2. the EVM Write capability submits it to a Chainlink-managed
///      `KeystoneForwarder`,
///   3. the forwarder verifies the report's signatures,
///   4. the forwarder calls `onReport(metadata, report)` on the consumer.
///
/// So a contract that wants to be driven by CRE must implement this interface,
/// and must trust the forwarder address as the report signer. Verified forwarder
/// for Monad testnet (from `cre workflow supported-chains`):
///   0xF8344CFd5c43616a4366C34E3EEE75af79a74482
interface IReceiver {
    /// @notice Called by the KeystoneForwarder with a verified report.
    /// @param metadata Forwarder-supplied metadata (workflow id, execution id, ...).
    /// @param report ABI-encoded payload produced by the workflow.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
