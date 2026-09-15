// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IReputationRegistry (ERC-8004 canonical)
/// @notice Hand-written interface matching the official ABI in
///         `contracts/abis/ReputationRegistry.json` (upstream: erc-8004/erc-8004-contracts).
///         Deployed deterministically; on Monad testnet (10143):
///         0x8004B663056A597Dffe9eCcC1965A193B7388713
///
/// @dev NOTE vs earlier drafts: `getSummary` returns `uint64` count and `int128`
///      summaryValue, NOT `uint256`/`int128`. Verified against the official ABI.
interface IReputationRegistry {
    /// @notice Leave signed fixed-point feedback about an agent.
    /// @param agentId Target agent (token id in the Identity Registry).
    /// @param value Signed fixed-point value; scale given by valueDecimals.
    /// @param valueDecimals 0-18.
    /// @param tag1 Primary taxonomy tag, e.g. "claimless:incident".
    /// @param tag2 Secondary tag, free-form.
    /// @param endpoint Optional service endpoint the feedback refers to.
    /// @param feedbackURI Optional off-chain URI with full feedback JSON.
    /// @param feedbackHash Optional hash of the off-chain payload.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /// @notice Aggregate feedback for an agent. `clientAddresses` MUST be non-empty
    ///         (the canonical registry requires it to reduce Sybil risk).
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    )
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    function getClients(uint256 agentId) external view returns (address[] memory);

    function getLastIndex(uint256 agentId, address clientAddress)
        external
        view
        returns (uint64);

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (
            int128 value,
            uint8 valueDecimals,
            string memory tag1,
            string memory tag2,
            bool isRevoked
        );

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    function getIdentityRegistry() external view returns (address);

    function getVersion() external pure returns (string memory);

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );
}
