package com.oxygenxml.examples.perforce;

import java.io.IOException;
import java.net.Proxy;
import java.net.URL;
import java.net.URLConnection;

import lombok.extern.slf4j.Slf4j;
import ro.sync.ecss.extensions.api.webapp.plugin.URLStreamHandlerWithContext;

@Slf4j
public class PerforceUrlStreamHandler extends URLStreamHandlerWithContext {
	  
	  @Override
	  protected URLConnection openConnectionInContext(String contextId, URL url,
	      Proxy proxy) throws IOException {
		  
		  log.warn("creating connection");
		  URLConnection p4connection = new URLConnection(url) {
		        @Override
		        public void connect() throws IOException {
		          connected = true;
		        }
		      };
		  return new PerforceUrlConnection(p4connection);
	    }
}
