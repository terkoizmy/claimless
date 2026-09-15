// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC721Receiver
/// @notice Minimal ERC-721 receiver interface (EIP-721). Needed because the
///         canonical ERC-8004 IdentityRegistry mints via `_safeMint`, which
///         calls `onERC721Received` on a contract recipient and reverts with
///         `ERC721InvalidReceiver` if the magic value is not returned.
interface IERC721Receiver {
    /// @return `IERC721Receiver.onERC721Received.selector`
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
