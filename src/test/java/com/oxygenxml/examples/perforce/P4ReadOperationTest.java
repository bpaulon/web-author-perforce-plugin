package com.oxygenxml.examples.perforce;

import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.net.PasswordAuthentication;
import java.net.URI;

import org.apache.commons.io.IOUtils;
import org.junit.Test;

public class P4ReadOperationTest {

	String p4Uri = "perforce://192.168.1.108:1666//StreamsDepot/mainSampleData/folderDiff/test9.txt";

	@Test
	public void getFileTest() throws Exception {
		P4ReadOperation pg = new P4ReadOperation(p4Uri,
				new PasswordAuthentication("test_user", "Passw0rd".toCharArray()));
		InputStream is = pg.read();

		StringWriter writer = new StringWriter();
		try {
			IOUtils.copy(is, writer, "UTF-8");
		} catch (IOException e) {
			e.printStackTrace();
		}
		String res = writer.toString();

		System.out.println("File contents:" + res);
		assertTrue("", res.contains("Sample Developer"));
	}

	@Test
	public void parseUrl() throws Exception {
		URI url = new URI(p4Uri);
		System.out.println("protocol: " + url.getScheme());

		System.out.println("host:" + url.getHost());
		System.out.println("port:" + url.getPort());

		System.out.println("path:" + url.getPath());

	}

}
