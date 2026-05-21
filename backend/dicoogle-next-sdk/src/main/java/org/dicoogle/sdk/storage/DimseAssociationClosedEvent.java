package org.dicoogle.sdk.storage;

/**
 * Describes a DIMSE association that has been released or aborted after being previously accepted.
 *
 * @param associationSerialNo the same identifier assigned when the association was accepted
 * @param callingAet          the AE title of the remote SCU
 * @param calledAet           the AE title of the local SCP
 * @param remoteHost          the hostname or IP address of the remote peer
 * @param localHost           the hostname or IP address of the local network interface
 * @param closedAt            an ISO-8601 timestamp recording when the association was closed
 */
public record DimseAssociationClosedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String closedAt) {}
