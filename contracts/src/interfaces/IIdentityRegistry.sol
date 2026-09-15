// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IIdentityRegistry (ERC-8004 canonical)
/// @notice Hand-written interface matching the official ABI in
///         `contracts/abis/IdentityRegistry.json` (upstream: erc-8004/erc-8004-contracts).
///         Deployed deterministically; on Monad testnet (10143):
///         0x8004A818BFB912233c491871b3d84c89A494BD9e
///
///         Agent identity is an ERC-721; `agentId` is the token id.
interface IIdentityRegistry {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    function register() external returns (uint256 agentId);

    function register(string calldata agentURI) external returns (uint256 agentId);

    function register(string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId);

    function setAgentURI(uint256 agentId, string calldata newURI) external;

    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function unsetAgentWallet(uint256 agentId) external;

    function getAgentWallet(uint256 agentId) external view returns (address);

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external;

    function getMetadata(uint256 agentId, string calldata metadataKey)
        external
        view
        returns (bytes memory);

    function tokenURI(uint256 tokenId) external view returns (string memory);

    function ownerOf(uint256 tokenId) external view returns (address);

    function balanceOf(address owner) external view returns (uint256);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function getVersion() external pure returns (string memory);

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
}
