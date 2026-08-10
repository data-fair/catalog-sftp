#!/bin/sh
# Executed by the atmoz/sftp entrypoint before sshd starts.
#
# The suite deliberately fails to authenticate a dozen times (the "invalid
# login / password / sshKey" cases). Since OpenSSH 9.8 PerSourcePenalties is
# enabled by default, so sshd banishes our source address for a few seconds
# after those failures and drops every later connection before the handshake,
# which made the tests running afterwards fail for an unrelated reason.
echo 'PerSourcePenalties no' >> /etc/ssh/sshd_config
