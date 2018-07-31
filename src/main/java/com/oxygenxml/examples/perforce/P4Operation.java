package com.oxygenxml.examples.perforce;

import java.net.URISyntaxException;
import java.util.Properties;

import com.perforce.p4java.exception.P4JavaException;
import com.perforce.p4java.option.UsageOptions;
import com.perforce.p4java.option.server.TrustOptions;
import com.perforce.p4java.server.IOptionsServer;
import com.perforce.p4java.server.IServer;
import com.perforce.p4java.server.ServerFactory;

public class P4Operation {

	protected String serverUri = "p4java://192.168.1.108:1666";
			// for non SSL connections
			/*"p4java://public.perforce.com:1666"*/
	
	protected String userName = "test-user";
	
	protected String clientName = "p4java_webAuth";
	
	protected String password = "pass";
	
	/**
	 * Get an IServer object from the P4Java server factory
	 * 
	 * @param props
	 * @return
	 * @throws P4JavaException
	 * @throws URISyntaxException
	 */
	protected IServer getServer(Properties props) throws P4JavaException, URISyntaxException {
		IServer server = ServerFactory.getServer(serverUri, props);
		return server;
	}
	
	/**
	 * Get an IOptionsServer object from the P4Java server factor
	 * 
	 * @param props
	 * @param opts
	 * @return
	 * @throws P4JavaException
	 * @throws URISyntaxException
	 */
	protected IOptionsServer getOptionsServer(Properties props, UsageOptions opts) throws P4JavaException, URISyntaxException {
		IOptionsServer server = ServerFactory.getOptionsServer(serverUri, props, opts);
		
		//To allow SSL connections use the 'addTrust' method with the 'autoAccept' option. 
		//server.addTrust(new TrustOptions(true, false, true));
		
		return server;
	}
}
