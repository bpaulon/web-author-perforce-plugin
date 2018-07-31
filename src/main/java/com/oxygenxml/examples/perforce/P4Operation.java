package com.oxygenxml.examples.perforce;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Properties;

import com.perforce.p4java.exception.P4JavaException;
import com.perforce.p4java.option.UsageOptions;
import com.perforce.p4java.option.server.TrustOptions;
import com.perforce.p4java.server.IOptionsServer;
import com.perforce.p4java.server.IServer;
import com.perforce.p4java.server.IServerAddress;
import com.perforce.p4java.server.ServerFactory;

public class P4Operation {

  // SSL connections
  // p4javassl://my.server.com:1666
  // Non SSL connections
  // p4java://my.server.com:1666
	protected URI serverUri;
			 
	
	/**
	 * Get an IServer object from the P4Java server factory
	 * 
	 * @param props
	 * @return
	 * @throws P4JavaException
	 * @throws URISyntaxException
	 */
	protected IServer getServer(Properties props) throws P4JavaException, URISyntaxException {
		IServer server = ServerFactory.getServer(serverUri.toString(), props);
		return server;
	}
	
	/**
	 * Get an IOptionsServer object from the P4Java server factory
	 * 
	 * @param props
	 * @param opts
	 * @return
	 * @throws P4JavaException
	 * @throws URISyntaxException
	 */
	protected IOptionsServer getOptionsServer(Properties props, UsageOptions opts) throws P4JavaException, URISyntaxException {
		IOptionsServer server = ServerFactory.getOptionsServer(serverUri.toString(), props, opts);
		
		if(IServerAddress.Protocol.P4JAVASSL.toString().equals(serverUri.getScheme())) {
		  //To allow SSL connections use the 'addTrust' method with the 'autoAccept' option. 
		  server.addTrust(new TrustOptions(true, false, true));
		}
		
		return server;
	}
}
